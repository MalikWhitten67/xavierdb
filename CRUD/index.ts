import Database from "bun:sqlite";
import fs from "fs";
import { bc } from "../entry"; 
class CRUD {
  private db: Database;
  private schemas: any[];
  constructor() {
    this.db = new Database(":memory:");    
    this.syncWithDisk(); 
    this.schemas = [];
    setInterval(() => {
        this.sync();
    },  1000 * 60 * 5) // 5 minutes   
  }

  private syncWithDatabase(db: Database, dbt: Database) {
    // Get the list of tables from both databases
    const tablesInMemory = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
    const tablesOnDisk = dbt.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);

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
            const fields = columns.map((column) => {
                return `${column.name} ${column.type}`;
            }).join(", ");
            dbt.prepare(`CREATE TABLE IF NOT EXISTS ${tableName} (${fields})`).run();

            // Insert data from memory to disk
            const data = db.prepare(`SELECT * FROM ${tableName}`).all();
            data.forEach((row) => {
                const keys = Object.keys(row);
                const values = Object.values(row);
                const valuesString = values.map((value) => {
                    return typeof value === "string" ? `'${value}'` : value;
                });
                dbt.prepare(`INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${valuesString.join(", ")})`).run();
            });
        }
    });

    // save data from memory to disk
    tablesInMemory.forEach((tableName) => {
        const data = db.prepare(`SELECT * FROM ${tableName}`).all(); 
        data.forEach((row) => {
            let disk = new Database(process.cwd() + "/data/db.sqlite");
            if(disk.prepare(`SELECT * FROM ${tableName} WHERE id = '${row.id}'`).get()) return;
            const keys = Object.keys(row);
            const values = Object.values(row);
            const valuesString = values.map((value) => {
                return typeof value === "string" ? `'${value}'` : value;
            }); 
            dbt.prepare(`INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${valuesString.join(", ")})`).run();
        });
    });
    
    tablesOnDisk.forEach((tableName) => {
      const data = dbt.prepare(`SELECT * FROM ${tableName}`).all(); 
      data.forEach((row) => {
          let disk = db;
          if(disk.prepare(`SELECT * FROM ${tableName} WHERE id = '${row.id}'`).get()) return;
          const keys = Object.keys(row);
          const values = Object.values(row);
          const valuesString = values.map((value) => {
              return typeof value === "string" ? `'${value}'` : value;
          }); 
          db.prepare(`INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${valuesString.join(", ")})`).run();
      });
  });
  
     
}

 public forceSync() {
    this.syncWithDisk();
 }


  private tableExists(tableName: string) {
    return this.db
      .prepare(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      )
      .get().count > 0;
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

    data.fields['id'] = 'TEXT PRIMARY KEY';
    data.fields['created_at'] = 'TEXT';
    data.fields['updated_at'] = 'TEXT';
    const fields = Object.entries(data.fields).map(([key, value]) => {
        
        return `${key} ${value}`;
    }).join(", "); 
    this.db.prepare(`CREATE TABLE IF NOT EXISTS ${data.name} (${fields})`).run();

    // Store schema for future reference
    this.schemas.push({
        name: data.name,
        required: data.required || [],
        fields: data.fields
    });
    return  {
      $: {
        name: data.name,
        required: data.required || [],
        fields: data.fields
      },
      ...this.collection(data.name)
    }
}

  collection(name: string) {
    return {
        insertOne: (data: any) => {  
            data["id"] = data["id"] || crypto.randomUUID();
            data["created_at"] = data["created_at"] || new Date().toISOString();
            data["updated_at"] = data["updated_at"] || new Date().toISOString();
            const keys = Object.keys(data); 
            const values = Object.values(data);
            const valuesString = values.map((value) => {
                return typeof value === "string" ? `'${value}'` : value;
            });
            let schema = this.schemas.find((schema) => schema.name === name);
            if (schema) {
                schema.required.forEach((requiredField) => {
                    if (!keys.includes(requiredField)) {
                        throw new Error(`${requiredField} is required`);
                    }
                });  
            }
            
            this.db.exec(`INSERT INTO ${name} (${keys.join(", ")}) VALUES (${valuesString.join(", ")})`); 
            bc.postMessage({collection: name, data: data, type: "insert"})
            setTimeout(() => {
              this.sync();
            }, 1000)
            return this.db.prepare(`SELECT * FROM ${name} WHERE id = '${data["id"]}'`).get()
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
            return this.db.prepare(queryString).all(...params);
        },
        /**
         * Get all records in the collection 
         */
        getAll: () => {
            return this.db.prepare(`SELECT * FROM ${name}`).all() as any[];
        },
      delete: (id: string) => {
        return this.db.prepare(`DELETE FROM ${name} WHERE id = ${id}`).run();
      },
      findOne: (id: string) => {
        return this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get();
      },
      find: (query: any) => {
        const keys = Object.keys(query);
        const values = Object.values(query);
        const valuesString = values.map((value) => {
          return typeof value === "string" ? `'${value}'` : value;
        });
        const where = keys
          .map((key, index) => {
            return `${key} = ${valuesString[index]}`;
          })
          .join(" AND ");
        return this.db.prepare(`SELECT * FROM ${name} WHERE ${where}`).all();
      },
      update: (id, data) => {
        // Add/update the "updated_at" field with the current timestamp
        data["updated_at"] = new Date().toISOString();
    
        // Extract keys and values from the updated data
        const keys = Object.keys(data);
        const values = Object.values(data);
    
        // Convert values to string format for SQL
        const valuesString = values.map(value => {
            return typeof value === "string" ? `'${value}'` : value;
        });
    
        // Generate SET clause for SQL UPDATE statement
        const set = keys.map((key, index) => {
            return `${key} = ${valuesString[index]}`;
        }).join(", ");
     
        this.db.prepare(`UPDATE ${name} SET ${set} WHERE id = "${id}"`).run(); 
        let d = this.db.prepare(`SELECT * FROM ${name} WHERE id = "${id}"`).get();
    
        // Merge retrieved data with updated data
        return Object.assign({}, d, data);
    }
    
    };
  }
}
 
export default new CRUD();
