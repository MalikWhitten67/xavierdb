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

    // create columns if they do not exist either in memory or disk
    tablesInMemory.forEach((tableName) => {
      const columns = db.prepare(`PRAGMA table_info(${tableName})`).all(); 
      const columnsDisk = dbt.prepare(`PRAGMA table_info(${tableName})`).all();  
      columns.forEach((column) => {
        if (
           !columnsDisk.find((c) => c.name === column.name)
        ) {
          dbt
            .prepare(
              `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.type}`
            )
            .run();
        }
      });
    });

     
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

  private jwt = {
    verify: async (token) => {
      return await Bun.password.verify(token, process.env.SECRET_KEY);
    },
    decode: async (token) => {
      let isMath = await Bun.password.verify(token, process.env.SECRET_KEY);
      if (!isMath) return { error: "Invalid token" };
      let matchedTokenData = this.token_Store.find(
        (t) => t.token === token
      );
      if (matchedTokenData) return matchedTokenData;
      else return { error: "Token not found" };
    },
    sign: async (data: any) => {
      let token = await Bun.password.hash(data);
      this.token_Store.push({ token: token, data: data });
      return token;
    },
  }
  collection(name: string) {
    return {
      name: name,
      auth:{
        isValid: async (token: string) => {
          return jwt.verify(token, process.env.SECRET_KEY);
        },
        decode: async (token: string) => {
          return jwt.decode(token);
        },
      },
      getOne: (id: string, options: {}) => {
        let schema = this.schemas.find((schema) => schema.name === name); 
        let data  = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get() as any;
        if(options.hasOwnProperty("expand")){
          let expand = options["expand"];  
          let hasRelated = Object.keys(schema.related).find((r) => expand.includes(schema.related[r]?.field));
          if(hasRelated){ 
            let related = schema.related[hasRelated];  
            let name = hasRelated;  
            let  d = this.db.prepare(`SELECT * FROM ${name} WHERE id = '${data[related.field]}'`).get(); 
            if(d.password) delete d.password;
            if(!d) return {error: "Related data by given id not found"};
            data['expand'] = d || null;
          }
        }
        return data;
      },
      insertOne: async (data: any) => {
        data["id"] = data["id"] || crypto.randomUUID();
        data["created_at"] = data["created_at"] || new Date().toISOString();
        data["updated_at"] = data["updated_at"] || new Date().toISOString();
        if (this.schemas.find((schema) => schema.name === name).auth) { 
          data["verified"] = false; 
          if(data["password"].length < 6) throw new Error("Password must be at least 6 characters");
          data["password"] = await Bun.password.hash(data["password"]);
          data["oauth_provider"] = data["oauth_provider"] || "email";
          data["email"] = data["email"].toLowerCase();
          data["emailVisible"] = data["emailVisible"] || true;
        }
        const keys = Object.keys(data);
        const values = Object.values(data);
        const valuesString = values.map((value) => {
          return typeof value === "string" ? `'${value}'` : value;
        });
        let schema = this.schemas.find((schema) => schema.name === name); 
        if (schema.auth) {
          if (!data.email) throw new Error("Email is required");
          if (!data.password) throw new Error("Password is required");
          if (this.collection(name).match({ email: data.email }).length)
            return { error: "Email already exists" };
        }
        if (schema) {
          schema.required.forEach((requiredField) => {
            if (!keys.includes(requiredField)) {
              throw new Error(`${requiredField} is required`);
            }
          });
        }

        // ensure schema has fields if not error
        let datakEYS = Object.keys(data);
        let schemaFields = Object.keys(schema.fields);
        datakEYS.forEach((key) => {
          if(!schemaFields.includes(key)) throw new Error(`Schema does not have field ${key} add it to schema fields`);
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
        return this.db
          .prepare(`SELECT * FROM ${name} WHERE id = "${data["id"]}"`)
          .get();
      },
       
      authWithPassword: async (data:{email: string, password: string}) => {
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
        if (!this.collection(name).match({ email: email }).length)
          return { error: "User not found" };
        let user = this.db.prepare(`SELECT * FROM ${name} WHERE email = '${email}'`).get(); 
        if(!process.env.SECRET_KEY) throw new Error("SECRET_KEY is required in .env"); 
        if (!(await Bun.password.verify(password, user.password)))
          return { error: "Invalid password" };
        delete user.password; 
        user.token =  jwt.sign(user, process.env.SECRET_KEY);
        this.token_Store.push(user);
        return user;
      },
      match: (query: Object) => {
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
        if(query.hasOwnProperty("expand")){
          let expand = query["expand"]; 
          let hasRelated = Object.keys(this.schemas.find((schema) => schema.name === name).related).find((r) => expand.includes(this.schemas.find((schema) => schema.name === name).related[r]?.field));
          if(hasRelated){ 
            let related = this.schemas.find((schema) => schema.name === name).related[hasRelated];  
            let name = hasRelated;  
            let  d = this.db.prepare(`SELECT * FROM ${name} WHERE id = '${query[related.field]}'`).get(); 
            if(d.password) delete d.password;
            if(!d) return {error: "Related data by given id not found"};
            return {data: this.db.prepare(queryString).all(...params), expand: d};
          }
        }
        let dt = this.db.prepare(queryString).all(...params);
        dt = dt.map((d) => {
          delete d.password;
          if (!d.emailVisible) delete d.email;
          return d;
        })  
        return dt;
      },
      /**
       * Get all records in the collection
       */
      getAll: () => {
        let schema = this.schemas.find((schema) => schema.name === name);
        let data = this.db.prepare(`SELECT * FROM ${name}`).all() as any[];
        if (schema.auth) {
          data = data.map((d) => {
            delete d.password;
            if (!d.emailVisible) delete d.email;
            return d;
          });
        }
        return data;
      },
      delete: (id: string) => {
        let schema = this.schemas.find((schema) => schema.name === name); 
        if(schema.auth){
            let token =  options?.token; 
            if(!token)  return {error: "Token is required"};
            let decoded = jwt.decode(token);
            if(!decoded)  return {error: "Invalid token"};
            if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"}; 
            if(decoded.id !== id) return {error: "Unauthorized"}; 
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
      update: (id, data, options: {token : any}) => {   
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
        if(schema.auth && schema.restrict){
            let token =  options?.token; 
            if(!token)  return {error: "Token is required"};
            let decoded = jwt.decode(token);
            if(!decoded)  return {error: "Invalid token"};
            if(!jwt.verify(token, process.env.SECRET_KEY))  return {error: "Invalid token"}; 
            if(decoded.id !== id) return {error: "Unauthorized"};

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
