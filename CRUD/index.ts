//@ts-nocheck
import Database from "bun:sqlite";
import jwt from 'jsonwebtoken'
import fs from "fs"; 
var Bun = globalThis.Bun;
class CRUD {
  private db: Database;
  private token_Store: any[];
  private schemas: any[];
  constructor() {
    this.db = new Database(":memory:");
   setTimeout(() => {
    this.syncWithDisk();
   }, 0);
    this.schemas = [];
    this.token_Store = [];
    setInterval(() => {
      this.sync();
    }, 1000 * 60 * 5); // 5 minutes
  }

   
  public forceSync() {
    this.sync();
  }

  private tableExists(tableName: string) {
    return (
      this.db
        .prepare(
          `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='${tableName}'`
        )
        .get().count > 0
    );
  }

  private syncWithDisk() {
    const target = process.cwd() + "/data/db.sqlite";
    if (!fs.existsSync(target)) {
      return;
    }
    const dbt = new Database(target); 
    this.SyncData(dbt, this.db);
  }

  private async SyncData(copy: Database, target: Database){
    const tables = copy.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    for (const tableObj of tables) {
        const table = tableObj.name;
        const fields = copy.prepare(`PRAGMA table_info(${table})`).all();
        const fieldsString = fields.map((f) => `${f.name} ${f.type}`).join(", ");
        target.prepare(`CREATE TABLE IF NOT EXISTS ${table} (${fieldsString})`).run(); 

        // Fetch data from the copy
        const copyData = copy.prepare(`SELECT * FROM ${table}`).all();

        for (const record of copyData) {
            const recordId = record.id;
            const targetRecord = target.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(recordId);

            if (!targetRecord) {
                // Insert new record if not exists in target
                const keys = Object.keys(record);
                const values = Object.values(record).map(value => {
                    if (value === null) return "NULL";
                    if (typeof value === "object") return JSON.stringify(value);
                    if (value === undefined) return "NULL";
                    return typeof value === "string" ? `'${value}'` : value;
                });

                const queryString = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${values.join(", ")})`;
                target.prepare(queryString).run();
            } else {
                // Update existing records if necessary
                const copyKeys = Object.keys(record);
                for (const key of copyKeys) {
                    if (record[key] !== targetRecord[key]) {
                        const value = record[key] === null ? "NULL" :
                                      typeof record[key] === "object" ? JSON.stringify(record[key]) :
                                      typeof record[key] === "string" ? `'${record[key]}'` : record[key];

                        target.prepare(`UPDATE ${table} SET ${key} = ${value} WHERE id = ?`).run(recordId);
                    }
                }
            }
        }

        // Fetch target schema
        const schema = this.schemas.find((schema)=> schema.name === table);

        if (schema) {
            // Remove columns that are not in the schema
            const targetFields = target.prepare(`PRAGMA table_info(${table})`).all();
            for (const field of targetFields) {
                if (!schema.fields.hasOwnProperty(field.name)) {
                    target.prepare(`ALTER TABLE ${table} DROP COLUMN ${field.name}`).run();
                }
            }

            // Add columns that are in the schema but not in the target table
            for (const fieldName in schema.fields) {
                if (!targetFields.find((f) => f.name === fieldName) && !fieldName.includes('error')) {
                    target.prepare(`ALTER TABLE ${table} ADD COLUMN ${fieldName} ${schema.fields[fieldName]}`).run();
                }
            }
        }
    }
}


  private sync() {
    fs.mkdirSync(process.cwd() + "/data", { recursive: true });
    const dbt = new Database(process.cwd() + "/data/db.sqlite"); 
    this.SyncData(this.db, dbt);
  }

  schema(data: any) {
    if (!data.name) {
      throw new Error("Name is required");
    }
    if (!data.fields) {
      throw new Error("Fields are required");
    }
 
    data.fields["id"] = "TEXT PRIMARY KEY";
    data.fields["created_at"] = "TEXT";
    data.fields["updated_at"] = "TEXT";
    if (data.auth) {
      data.fields["verified"] = "BOOLEAN";
      data.fields["password"] = "TEXT";
      data.fields["email"] = "TEXT";
      data.fields["oauth_provider"] = "TEXT";
      data.fields["emailVisible"] = "BOOLEAN";
    }
    const fields = Object.entries(data.fields)
      .map(([key, value]) => {
        return `${key} ${value}`;
      })
      .join(", "); 
    this.db
      .prepare(`CREATE TABLE IF NOT EXISTS ${data.name} (${fields})`)
      .run();

    // Store schema for future reference
    this.schemas.push(data);

    this.sync();
    return {
      $: {
        name: data.name,
        required: data.required || [],
        fields: data.fields,
      },

      ...this.collection(data.name),
    };
  }

  error(error: any) {
    let logs = fs.createWriteStream(process.cwd() + "/data/logs.txt", {
      flags: "a",
    });
    logs.write(`${new Date().toISOString()} - ${error}\n`);
  }

   jwt = {
    verify: async (token: string) => {
       try {
          jwt.verify(token, process.env.TOKEN_SECRET);
          return  true
       } catch (error) {
         return false;
       }
    },
    decode: async (token) => {
      return jwt.decode(token);
    },
    create: async (data: any) => {
      return jwt.sign(data, process.env.TOKEN_SECRET, {expiresIn: process.env.TOKEN_EXPIRY || "1h"});
    } 
  }
  
  collection(name: string) {
    return {
      name: name, 
       auth:{
        isValid: async (token: string) => {
          return jwt.verify(token, process.env.TOKEN_SECRET);
        },
        decode: async (token: string) => {
          return jwt.decode(token);
        },
      }, 
      findOne: (id: string, options: Object) => {
        let schema = this.schemas.find((schema) => schema.name === name); 
        let data  = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get() as any; 
         
         if(data){
          if(options.hasOwnProperty("expand")){
            let expand = options["expand"];  
            for(var e in expand){
              let collection = this.collection(e);
              let d = collection.match({[expand[e]]: id}, options);
              let collectionSchema = this.schemas.find((schema) => schema.name === e);
              if(collectionSchema.auth){
                d = d.filter((d) => d.emailVisible);
                d = d.map((d) => { delete d.email; return d; });
                d = d.map((d) => { delete d.password; return d; });
              }
              data[e] = d;
            }
          }
          delete data.password;
          if (!data.emailVisible) delete data.email; 
         }
        return  data || null;
      },
      getPassword: (id: string) => {
        let schema = this.schemas.find((schema) => schema.name === name);
        if(!schema.auth) return {error: "Auth is not enabled for this collection"};
        let data = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get();
        if(!data) return {error: "Record not found"};  
        return data.password;
      },
      insertOne: async (data: any) => {
        data["id"] = data["id"] || crypto.randomUUID();
        data["created_at"] = data["created_at"] || new Date().toISOString();
        data["updated_at"] = data["updated_at"] || new Date().toISOString();
        let schema = this.schemas.find((schema) => schema.name === name);
        if(schema.required){
          for(var r in schema.required){
            if(!data.hasOwnProperty(schema.required[r])){
              return {error: `${schema.required[r]} is required`};
            }
          }
        }
        // REMOVE any fields that are not in the schema
        for(var dtf in data){
          if(!schema.fields.hasOwnProperty(dtf)){
            delete data[dtf];
          }
        } 
        if(schema.auth){
          if(!data.email || !data.password) return {error: "Email and password are required"};
          if(!data.email.includes("@")) return {error: "Invalid email"};
          if(!process.env.TOKEN_SECRET) throw new Error("TOKEN_SECRET is required in .env"); 
          data.password = await Bun.password.hash(data.password);
          data.emailVisible = data.emailVisible || false;
        }
        for(var df in data){
          if(typeof data[df] === "object"){
            data[df] = JSON.stringify(data[df]);
          }
          if(data[df] === undefined || data[df] === null){
            data[df] = "0"
          }
        }
        const keys = Object.keys(data);
        const values = Object.values(data);
        const valuesString = values.map((value) => {
          if(value === null) return "NULL";
          if(typeof value === "object") return JSON.stringify(value);
          if(value === undefined) return "NULL";
          return typeof value === "string" ? `'${value}'` : value;
        }); 
        const queryString = `INSERT INTO ${name} (${keys.join(
          ", "
        )}) VALUES (${valuesString.join(", ")})`;
        this.db.prepare(queryString).run();
        let d = this.db
          .prepare(`SELECT * FROM ${name} WHERE id = "${data.id}"`)
          .get();
        globalThis.wssClients.forEach((client) => {
          client.send(
            JSON.stringify({
              event: "insert",
              collection: name,
              data: d,
            })
          );
        }
        );
        delete d.password;
        if (!d.emailVisible) delete d.email;
        setTimeout(() => {
          this.sync()
        },  1000);
        return d;
      },
       
      authWithPassword: async (data:{EmailOrUsername: string, password: string}) => {
        if(!this.schemas.find((schema) => schema.name === name).auth) return {error: "Auth is not enabled for this collection"};
        let { EmailOrUsername , password} = data;
        
        if (!EmailOrUsername || !password){
          var missing = !EmailOrUsername ? "email" : !password ? "password" : null;
          return { error: `${missing} is required` , code: 400, missing: missing}; 
        }
        let isEmail = EmailOrUsername.includes("@");
        if(EmailOrUsername.includes("@")){
          const verifyEmail = (email: string) => {
            let isVerified = email.match(
              /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/
            )
              ? true
              : false;
            return isVerified;
          };
          
          !verifyEmail(EmailOrUsername) ? { error: "Invalid email" } : null;
        }
   
        let user = this.db.prepare(`SELECT * FROM ${name} WHERE ${isEmail ? "email" : "username"} = "${EmailOrUsername}"`).get();
        if(!user) return {error: "User not found"};
        if(!process.env.TOKEN_SECRET) throw new Error("TOKEN_SECRET is required in .env"); 
        if(!process.env.TOKEN_SECRET) throw new Error("TOKEN_SECRET is required in .env"); 
        if (!(await Bun.password.verify(password, user.password))) return { error: "Invalid password" };
        delete user.password;  
        user.token =  jwt.sign(user, process.env.TOKEN_SECRET, {expiresIn: process.env.TOKEN_EXPIRY || "1h"});
        this.token_Store.push(user);
        return user;
      },
      authWithToken: async (token: string) => {
        if(!this.schemas.find((schema) => schema.name === name).auth) return {error: "Auth is not enabled for this collection"};
        if(!token) return {error: "Token is required"};
        let user = this.token_Store.find((u) => u.token === token);
        if(!user) return {error: "Invalid token or token has expired"};
        return user;
      },

      upload: async (data: any, {filename, collection}) => {
        if (!fs.existsSync(process.cwd() + "/uploads")) fs.mkdirSync(process.cwd() + "/uploads", {recursive: true});
        let id = crypto.randomUUID();
        let extension = filename.split('.').pop(); // Extract file extension
        let path = process.cwd() + "/uploads/" + collection + "/" + id + '.' + extension; // Use extracted extension
        fs.mkdirSync(process.cwd() + "/uploads/" + collection, {recursive: true}); 
        await Bun.write(path, data);
        return {id, path: path.replace(process.cwd(), ""), url: `files/${collection}/${id}.${extension}`};
    },

     
    
      
      match: (query: Object, options: {sort: 'asc' | 'desc', limit: number }) => { 
        const conditions: any[] = [];
        const params: any[] = [];
        query = query || {};
        for (const key in query) {
          if (Object.hasOwnProperty.call(query, key)) {
            if (key.includes("_includes")) {
              var fieldName: string = key.replace("_includes", "") as string;
              conditions.push(`${fieldName} LIKE ?`);
              params.push(`%${query[key]}%`);
            } else {
              conditions.push(`${key} = ?`);
              params.push(query[key]);
            }
          }
        } 
        var where = conditions.join(" AND ");
        if(where === "") where = "1 = 1";
        const queryString = `SELECT * FROM ${name} WHERE ${where}`;
        
        let dt =  this.db.prepare(queryString).all(params).filter((d) => { return d; });
        if(options && options.hasOwnProperty("expand")){
          let expand = options["expand"];  
           if(expand){
            for(var e in expand){
              for(var d in dt){
               let collection = this.collection(e);
               let data = collection.match({[expand[e]]: dt[d].id}, options);
               let collectionSchema = this.schemas.find((schema) => schema.name === e);
               if(collectionSchema.auth){
                 data = data.filter((d) => d.emailVisible);
                 data = data.map((d) => { delete d.email; return d; });
                 data = data.map((d) => { delete d.password; return d; });
               }
               dt[d][e] = data;
           }
         }  
           }
        } 
        if(options && options.hasOwnProperty("sort")){
          let sort = options["sort"];
          dt = dt.sort((a, b) => {
            if(sort === "asc"){
              return new Date(a.created_at) - new Date(b.created_at);
            }else{
              return new Date(b.created_at) - new Date(a.created_at);
            }
          });
        }
        if(options && options.hasOwnProperty("limit")){
          let limit = options["limit"];
          dt = dt.slice(0, limit);
        }
        let schema = this.schemas.find((schema) => schema.name === name);
        if(schema.auth){
          dt = dt.filter((d) => d.emailVisible);
          dt = dt.map((d) => { delete d.email; return d; });
          dt = dt.map((d) => { delete d.password; return d; });
        }
        if(schema.related){
          let fields = Object.keys(schema.related);
          for(var f in fields){
            let collection = this.collection(fields[f]); 
            let foriegn = schema.related[fields[f]].foriegn;
            let replacing = schema.related[fields[f]].fields;
            for(var d in dt){
              let data = collection.match({[foriegn]: dt[d].id});
              if(schema.auth)dt[d][fields[f]] = data.filter((d) => d.emailVisible); 
              else dt[d][fields[f]] = data;
              delete dt[d][fields[f]].password;
              // only return the fields specified in the schema
              for(var r in replacing){
                if(replacing[r] !== true){
                  for(var k in dt[d][fields[f]]){
                    if(k !== replacing[r]){
                      delete dt[d][fields[f]][k];
                    }
                  }
                }
              }

            }

          }
        }

        return dt || [];
      },
      /**
       * Get all records in the collection
       */
      getAll: () => {
        
        let data = this.db.prepare(`SELECT * FROM ${name}`).all();
        
        return data;
      },
      delete: (id: string) => { 
        let exists = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get();
        if(!exists) return {error: "Record not found"}; 
        

        this.db.prepare(`DELETE FROM ${name} WHERE id = "${id}"`).run();
        globalThis.wssClients.forEach((client) => {
          client.send(
            JSON.stringify({
              event: "delete",
              collection: name,
              data: { id },
            })
          );
        });
        return { id };
      }, 
      update: (id: string, data: any) => {   
        data["updated_at"] = new Date().toISOString();  
        const keys = Object.keys(data);
        const values = Object.values(data);
 
        const valuesString = values.map((value) => {
          if(value === null) return "NULL";
          if(typeof value === "object") return JSON.stringify(value);
          if(value === undefined) return "NULL";
          return typeof value === "string" ? `'${value}'` : value;
        });
 
        const set = keys
          .map((key, index) => {
            return `${key} = ${valuesString[index]}`;
          })
          .join(", ");
 
        let record = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get();
        if(!record) return {error: "Record not found"};
         
        this.db.prepare(`UPDATE ${name} SET ${set} WHERE id = "${id}"`).run();
        let d = this.db
          .prepare(`SELECT * FROM ${name} WHERE id = "${id}"`)
          .get();

        globalThis.wssClients.forEach((client) => {
          client.send(
            JSON.stringify({
              event: "update",
              collection: name,
              data: d,
            })
          );
        });  
        delete d.password;
        if (!d.emailVisible) delete d.email; 
        this.sync();
        return d;
      },
      
    };
  }
}

export default new CRUD();
