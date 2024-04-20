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
    this.syncWithDisk();
    this.schemas = [];
    this.token_Store = [];
    setInterval(() => {
      this.sync();
    }, 1000 * 60 * 5); // 5 minutes
  }

  private syncWithDatabase(db: Database, dbt: Database) {
    // Get the list of tables from both databases
    const tablesInMemory = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name);
    const tablesOnDisk = dbt
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name);

    // Handle tables that exist in disk but are not in memory
    tablesOnDisk.forEach((tableName) => {
      if (!tablesInMemory.includes(tableName)) {
        // Table exists on disk but not in memory, so drop it from disk
        dbt.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
      }
    });

    // Handle tables that exist in memory but are not in disk
    tablesInMemory.forEach((tableName) => {
      if (!tablesOnDisk.includes(tableName)) {
        // Table exists in memory but not on disk, so create it on disk
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const fields = columns
          .map((column) => {
            return `${column.name} ${column.type}`;
          })
          .join(", ");
        dbt
          .prepare(`CREATE TABLE IF NOT EXISTS ${tableName} (${fields})`)
          .run();

        // Insert data from memory to disk
        const data = db.prepare(`SELECT * FROM ${tableName}`).all();
        data.forEach((row) => {
          const keys = Object.keys(row);
          const values = Object.values(row);
          const valuesString = values.map((value) => {
            return typeof value === "string" ? `'${value}'` : value;
          });
          dbt
            .prepare(
              `INSERT INTO ${tableName} (${keys.join(
                ", "
              )}) VALUES (${valuesString.join(", ")})`
            )
            .run();
        });
      }
    });

    // save data from memory to disk
    tablesInMemory.forEach((tableName) => {
      const data = db.prepare(`SELECT * FROM ${tableName}`).all();
      data.forEach((row) => {
        let disk = new Database(process.cwd() + "/data/db.sqlite");
        if (
          disk
            .prepare(`SELECT * FROM ${tableName} WHERE id = '${row.id}'`)
            .get()
        )
          return;
        const keys = Object.keys(row);
        const values = Object.values(row);
        const valuesString = values.map((value) => {
          return typeof value === "string" ? `'${value}'` : value;
        });
        dbt
          .prepare(
            `INSERT INTO ${tableName} (${keys.join(
              ", "
            )}) VALUES (${valuesString.join(", ")})`
          )
          .run();
      });
    });

    tablesOnDisk.forEach((tableName) => {
      const data = dbt.prepare(`SELECT * FROM ${tableName}`).all();
      data.forEach((row) => {
        let disk = db;
        if (
          disk
            .prepare(`SELECT * FROM ${tableName} WHERE id = '${row.id}'`)
            .get()
        )
          return;
        const keys = Object.keys(row);
        const values = Object.values(row);
        const valuesString = values.map((value) => {
          return typeof value === "string" ? `'${value}'` : value;
        });
        db.prepare(
          `INSERT INTO ${tableName} (${keys.join(
            ", "
          )}) VALUES (${valuesString.join(", ")})`
        ).run();
      });
    });
  
    for(var s in this.schemas){ 
      s = this.schemas[s] as any;
      //@ts-ignore
      let columns = Object.keys(s.fields); 
      // take columns and sync with disk and memory based on schema 
      columns.forEach((column) => {
        //@ts-ignore
        // only use schema fields remove any that dont exist in schema fields
        let columns = db.prepare(`PRAGMA table_info(${s.name})`).all();
        let columnsDisk = dbt.prepare(`PRAGMA table_info(${s.name})`).all();
        for (const c in columns) {
          if (!s.fields.hasOwnProperty(columns[c].name)) {
            db.prepare(`ALTER TABLE ${s.name} DROP COLUMN ${columns[c].name}`).run();
            dbt.prepare(`ALTER TABLE ${s.name} DROP COLUMN ${columns[c].name}`).run();
          }else if (!columnsDisk.find((d) => d.name === columns[c].name)) {
            dbt.prepare(`ALTER TABLE ${s.name} ADD COLUMN ${columns[c].name} ${columns[c].type}`).run();
            db.prepare(`ALTER TABLE ${s.name} ADD COLUMN ${columns[c].name} ${columns[c].type}`).run(); 
          }
        } 
      });
    }

     
  }

  public forceSync() {
    this.syncWithDisk();
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
    this.syncWithDatabase(dbt, this.db);
  }

  private sync() {
    fs.mkdirSync(process.cwd() + "/data", { recursive: true });
    const dbt = new Database(process.cwd() + "/data/db.sqlite");
    this.syncWithDatabase(this.db, dbt);
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
    verify: async (token) => {
       try {
          jwt.verify(token, process.env.SECRET_KEY);
          return  true
       } catch (error) {
         return false;
       }
    },
    decode: async (token) => {
      return jwt.decode(token);
    },
    sign: async (data: any) => {
      return jwt.sign(data, process.env.SECRET_KEY, {expiresIn: process.env.TOKEN_EXPIRY || "1h"});
    },
  }
  
  collection(name: string) {
    return {
      name: name,
       /**
   * @description Bypass auth handling (USE WITH CAUTION)
   */
  admin: {
    getOne: (id: string) => {
      let schema = this.schemas.find((schema) => schema.name === name);
      let data  = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get() as any;
      if(schema.auth){
        delete data.password;
        if (!data.emailVisible) delete data.email;
      }
      return data;
    },
    insertOne: async (data: any) => { 
      data["id"] = data["id"] || crypto.randomUUID();
      data["created_at"] = data["created_at"] || new Date().toISOString();
      data["updated_at"] = data["updated_at"] || new Date().toISOString();
      if (schema.auth) {
        data["verified"] = false;
        if (!data["email"]) return { error: "Email is required" };
        if (!data["password"]) return { error: "Password is required" };
        if (data["password"].length < 6)
          return { error: "Password must be at least 6 characters" };
        data["password"] = await Bun.password.hash(data["password"]);
        data["oauth_provider"] = data["oauth_provider"] || "email";
        data["email"] = data["email"].toLowerCase();
        data["emailVisible"] = data["emailVisible"] || true;
      }
      // filter null and undefined values
      data = Object.keys(data).reduce((object, key) => {
        if (data[key] != null) {
          object[key] = data[key];
        }
        return object;
      }, {});

      const keys = Object.keys(data);
      const values = Object.values(data);
      const valuesString = values.map((value) => {
        return typeof value === "string" ? `'${value}'` : value;
      });
      let schema = this.schemas.find((schema) => schema.name === name);
      if (schema.auth) {
        if (!data.email) return { error: "Email is required" };
        if (!data.password) return { error: "Password is required" };
        if (this.collection(name).match({ email: data.email }).length)
          return { error: "Email already exists" };
      }
      if (schema) {
        let error = false;
        schema.required.forEach((requiredField) => {
          if (!keys.includes(requiredField)) {
            error = true;
            return { error: `${requiredField} is required` };
          }
        });
        if (error) return { error: "Required fields are missing" };
      }

      // ensure schema has fields if not error
      let datakEYS = Object.keys(data);
      let schemaFields = Object.keys(schema.fields);
      datakEYS.forEach((key) => {
        if (!schemaFields.includes(key))
          return { error: `${key} is not a valid field` };
      })

      this.db.exec(
        `INSERT INTO ${name} (${keys.join(", ")}) VALUES (${valuesString.join(
          ", "
        )})`
      );
      globalThis.wssClients.forEach((client) => {
        console.log("sending data to client");
        client.send(
          JSON.stringify({
            event: "insert",
            collection: name,
            data: this.db
              .prepare(`SELECT * FROM ${name} WHERE id = '${data["id"]}'`)
              .get(),
          })
        );
      });
      setTimeout(() => {
        this.sync();
      }, 1000);
      let dt = this.db
        .prepare(`SELECT * FROM ${name} WHERE id = "${data["id"]}"`)
        .get();
      if (dt?.password) delete dt.password;
      if (!dt.emailVisible) delete dt.email;
      return dt;
    },
    find: (query: Object) => {
      let schema = this.schemas.find((schema) => schema.name === name);
      const conditions: any[] = [];
      const params: any[] = [];

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

      const where = conditions.join(" AND ");
      const queryString = `SELECT * FROM ${name} WHERE ${where}`;
      return this.db.prepare(queryString).all(params);
    },
    match: (query: Object) => {
      let schema = this.schemas.find((schema) => schema.name === name);
      const conditions: any[] = [];
      const params: any[] = [];

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

      const where = conditions.join(" AND ");
      const queryString = `SELECT * FROM ${name} WHERE ${where}`;

      let dt = this.db.prepare(queryString).all(params).filter((d) => {
        return d;
      });
      return dt;
    },
    getAll: () => {
      let schema = this.schemas.find((schema) => schema.name === name);
      let data = this.db.prepare(`SELECT * FROM ${name}`).all();
      data = data.map((d) => {
        if (schema.auth) {
          delete d.password;
          if (!d.emailVisible) delete d.email;
        }
        return d;
      });
      return data;
    },
    viewAll: () => {
      let schema = this.schemas.find((schema) => schema.name === name);
      let data = this.db.prepare(`SELECT * FROM ${name}`).all();
      data = data.map((d) => {
        if (schema.auth) {
          delete d.password;
          if (!d.emailVisible) delete d.email;
        }
        return d;
      });
      return data; 
    }
 },
      auth:{
        isValid: async (token: string) => {
          return jwt.verify(token, process.env.SECRET_KEY);
        },
        decode: async (token: string) => {
          return jwt.decode(token);
        },
      },
      getOne: (id: string, options: {token: string}) => {
        let schema = this.schemas.find((schema) => schema.name === name); 
        let data  = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get() as any;
        if(schema.auth){
          let token =  options?.token; 
          if(!token)  return {error: "Token is required"};
          let decoded = jwt.decode(token);
          if(!decoded)  return {error: "Invalid token"};
          if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"};  
          let {owner, other, for: v } = schema.viewable;
          let isOwner = jwt.decode(options.token).id === data[v];
          let ownerFields = owner()
          let otherFields = other()
          if(!isOwner){
            ownerFields.forEach((f) => {
              delete data[f];
            });
          }
          else if(isOwner){
            otherFields.forEach((f) => {
              delete data[f];
            });
          }
        }
        let uid = jwt.decode(options.token).id;
        if(schema.viewable){
          let viewable = schema.viewable;
          let {owner, other, for: v } = viewable; 
          let ownerFields = owner()
          let otherFields = other()
          switch (true) {
            case uid === data[v]:
              Object.keys(data).forEach((f) => {
                if(!ownerFields.includes(f)) delete data[f];
              });
              break;
            default:
              Object.keys(data).forEach((f) => {
                if(!otherFields.includes(f)) delete data[f];
              });
              break;
          }
          if(schema.auth){
            delete data.password;
            if (!data.emailVisible) delete data.email;
          }
        } 
        if(options.hasOwnProperty("expand")){
          let expand = options["expand"];  
          for(var e in expand){
            let collection = this.collection(e);
            let d = collection.match({[expand[e]]: id}, options);
            data[e] = d;
          }
        }
        delete data.password;
        if (!data.emailVisible) delete data.email; 
        return data;
      },
      insertOne: async (data: any) => {
        data["id"] = data["id"] || crypto.randomUUID();
        data["created_at"] = data["created_at"] || new Date().toISOString();
        data["updated_at"] = data["updated_at"] || new Date().toISOString();
        if (this.schemas.find((schema) => schema.name === name).auth) { 
          data["verified"] = false; 
          if(!data["email"]) return {error: "Email is required"};
          if(!data["password"]) return {error: "Password is required"};
          if(data["password"].length < 6) return {error: "Password must be at least 6 characters"};
          data["password"] = await Bun.password.hash(data["password"]);
          data["oauth_provider"] = data["oauth_provider"] || "email";
          data["email"] = data["email"].toLowerCase();
          data["emailVisible"] = data["emailVisible"] || true;
        }
        // filter null and undefined values
        data = Object.keys(data).reduce((object, key) => {
          if (data[key] != null) {
            object[key] = data[key];
          }
          return object;
        }, {});
        
        const keys = Object.keys(data);
        const values = Object.values(data);
        const valuesString = values.map((value) => {
          return typeof value === "string" ? `'${value}'` : value;
        });
        let schema = this.schemas.find((schema) => schema.name === name); 
        if (schema.auth) {
          if (!data.email) return { error: "Email is required" };
          if (!data.password) return { error: "Password is required" };
          if (this.collection(name).match({ email: data.email }).length)
            return { error: "Email already exists" };
        }
        if (schema) {
          let error = false;
          schema.required.forEach((requiredField) => {
            if (!keys.includes(requiredField)) {
              error = true;
              return { error: `${requiredField} is required` };
            }
          });
          if (error) return { error: "Required fields are missing" };
        }

        // ensure schema has fields if not error
        let datakEYS = Object.keys(data);
        let schemaFields = Object.keys(schema.fields);
        datakEYS.forEach((key) => {
          if(!schemaFields.includes(key)) return {error: `${key} is not a valid field`};
        }); 
        
 

        this.db.exec(
          `INSERT INTO ${name} (${keys.join(", ")}) VALUES (${valuesString.join(
            ", "
          )})`
        ); 
        globalThis.wssClients.forEach((client) => {
          console.log("sending data to client");
          client.send(
            JSON.stringify({
              event: "insert",
              collection: name,
              data: this.db
                .prepare(`SELECT * FROM ${name} WHERE id = '${data["id"]}'`)
                .get(),
            })
          );
        });
        setTimeout(() => {
          this.sync();
        }, 1000);
        let dt =   this.db
        .prepare(`SELECT * FROM ${name} WHERE id = "${data["id"]}"`)
        .get();
        if(dt?.password) delete dt.password;
        if (!dt.emailVisible) delete dt.email;
        return  dt
      },
       
      authWithPassword: async (data:{email: string, password: string}) => {
        if(!this.schemas.find((schema) => schema.name === name).auth) return {error: "Auth is not enabled for this collection"};
        let { email, password} = data;
        const verifyEmail = (email: string) => {
          let isVerified = email.match(
            /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/
          )
            ? true
            : false;
          return isVerified;
        };
        if (!email || !password)
          return { error: "Email and password are required" };
        if (!verifyEmail(email)) return { error: "Invalid email" }; 
        if (!this.collection(name).find({ email }))
          return { error: "User not found" };
        let user = this.db.prepare(`SELECT * FROM ${name} WHERE email = '${email}'`).get();  
        if(!process.env.SECRET_KEY) throw new Error("SECRET_KEY is required in .env"); 
        if (!(await Bun.password.verify(password, user.password)))
          return { error: "Invalid password" };
        delete user.password; 
        user.token =  jwt.sign(user, process.env.SECRET_KEY, {expiresIn: process.env.TOKEN_EXPIRY || "1h"});
        this.token_Store.push(user);
        return user;
      },
      /**
       *  
       * @private;
       */
      find: (query: Object) => {
        const conditions: any[] = [];
        const params: any[] = [];

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

        const where = conditions.join(" AND ");
        const queryString = `SELECT * FROM ${name} WHERE ${where}`;
        return this.db.prepare(queryString).all(params);
      },
      match: (query: Object, options: {token: string}) => {
        let schema = this.schemas.find((schema) => schema.name === name);
        if(schema.auth){
          let token =  options?.token; 
          if(!token)  return {error: "Token is required"};
          let decoded = jwt.decode(token);
          if(!decoded)  return {error: "Invalid token"};
          if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"};  
        }
        
        const conditions: any[] = [];
        const params: any[] = [];

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

        const where = conditions.join(" AND ");
        const queryString = `SELECT * FROM ${name} WHERE ${where}`;
        
        let dt =  this.db.prepare(queryString).all(params).filter((d) => { return d; });
        if(schema.viewable){
          let token =  options?.token; 
          if(!token)  return {error: "Token is required"};
          let decoded = jwt.decode(token);
          if(!decoded)  return {error: "Invalid token"};
          if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"};  
          let {owner, other, for: v } = schema.viewable;
          dt = dt.map((d) => {
            let isOwner = jwt.decode(options.token).id === d[v];
            let ownerFields = owner()
            let otherFields = other()
            if(!isOwner){
              Object.keys(d).forEach((f) => {
                if(!ownerFields.includes(f)) delete d[f];
              });
            }
            else if(isOwner){
              Object.keys(d).forEach((f) => {
                if(!otherFields.includes(f)) delete d[f];
              });
            }
            if(schema.auth){
              delete d.password;
              if (!d.emailVisible) delete d.email;
            }
            return d;
          });
        }  
        console.log(dt);
        return dt;
      },
      /**
       * Get all records in the collection
       */
      getAll: (options: {token: string}) => {
        let schema = this.schemas.find((schema) => schema.name === name);
        if(schema.auth){
          let token =  options?.token; 
          if(!token)  return {error: "Token is required"};
          let decoded = jwt.decode(token);
          if(!decoded)  return {error: "Invalid token"};
          if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"};  
        }
        let data = this.db.prepare(`SELECT * FROM ${name}`).all();
        if(schema.viewable){
          let token =  options?.token; 
          if(!token)  return {error: "Token is required"};
          let decoded = jwt.decode(token);
          if(!decoded)  return {error: "Invalid token"};
          if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"};  
          let {owner, other, for: v } = schema.viewable;
          let id = jwt.decode(options.token).id;
          data = data.map((d) => { 
            switch (true) {
               case id === d[v]:
                  Object.keys(d).forEach((f) => {
                    if(!owner().includes(f)) delete d[f];
                  });
                  break;
                default:
                  Object.keys(d).forEach((f) => {
                    if(!other().includes(f)) delete d[f];
                  });
                  break;
            }
            if(schema.auth){
              delete d.password;
              if (!d.emailVisible) delete d.email;
            }
            return d;
          });
        }
        return data;
      },
      delete: (id: string, options: {token: string}) => {
        let schema:{restrict: boolean, deletable:{owner: any , other: any, for: string}} = this.schemas.find((schema) => schema.name === name); 
        let exists = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get();
        if(!exists) return {error: "Record not found"};
         
        if(schema.auth){
            let token =  options?.token; 
            if(!token)  return {error: "Token is required"};
            let decoded = jwt.decode(token);
            if(!decoded)  return {error: "Invalid token"};
            if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"};  
        } 
        if(schema.restrict){
          let token =  options?.token; 
          if(!token)  return {code: 401, error: "Token is required"};
          let decoded = jwt.decode(token);
          if(!decoded)  return {code: 401, error: "Invalid token"};
          if(!jwt.verify(token, process.env.SECRET_KEY))  return {code: 401, error: "Invalid token"}; 
        }
        if(schema.deletable){
          if(!schema.deletable.for) return {error: "deletaable.for is required"};
          if(!options.token) return {error: "Token is required"};
          let {owner, other, for: v } = schema.deletable;
          let isOwner = jwt.decode(options.token).id === exists[v];
          if(!isOwner){
            if(!owner) return {code: 401, error: "Cannot delete this record"};
          }
          else if(isOwner){
            if(!other) return {code: 401, error: "Cannot delete this record"};
          }
        }

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
      update: (id: string, data: any, options: {token : any}) => {   
        data["updated_at"] = new Date().toISOString();  
        const keys = Object.keys(data);
        const values = Object.values(data);
 
        const valuesString = values.map((value) => {
          return typeof value === "string" ? `'${value}'` : value;
        });
 
        const set = keys
          .map((key, index) => {
            return `${key} = ${valuesString[index]}`;
          })
          .join(", ");

        let schema = this.schemas.find((schema) => schema.name === name); 
        if(schema.auth){
          let token =  options?.token; 
          if(!token)  return {error: "Token is required"};
          let decoded = jwt.decode(token);
          if(!decoded)  return {error: "Invalid token"};
          if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"};  
        }
        let record = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get();
        if(!record) return {error: "Record not found"};
        if(schema.updatable){
          if(!schema.updatable.for) return {error: "updatable.for is required"};
          if(!options.token) return {error: "Token is required"};
          let {owner, other, for: v } = schema.updatable; 
          let isOwner = jwt.decode(options.token).id === record[v];
          let ownerFields = owner()
          let otherFields = other()
          let fields = Object.keys(data);
          if(!isOwner){
            let fields = Object.keys(data); 
            if(fields.some((f) => ownerFields.includes(f))) return {code: 401, error: `Cannot update ${fields.join(", ")}`, fields: ownerFields};
          }
          else if(isOwner){
            if(fields.some((f) => otherFields.includes(f))) return {code: 401, error: `Cannot update ${fields.join(", ")}`, fields: otherFields};
          } 
        }
        
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
        return d;
      },
      
    };
  }
}

export default new CRUD();
