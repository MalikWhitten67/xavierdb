//@ts-nocheck
import fs from "fs";
import { responseCodes } from "./enums/http_response_codes";
import jwt from "jsonwebtoken";
import type from "./ext/types.txt";
import { file } from "bun";
import env_example from "./ext/.env.example.txt";
import crud from "./ext/crud.txt";
import Bun from "bun";
import ansiColors from "ansi-colors";
import "./transpiler/transpiler";
/**
 * @description CacheNodes are xavier next clients that are used to cache data from the server
 */
 
if (!fs.existsSync(process.cwd() + "/node_modules/xavierdb/crud/index.ts")) {
  fs.mkdirSync(process.cwd() + "/node_modules/xavierdb/crud", {
    recursive: true,
  });
  fs.writeFileSync(
    process.cwd() + "/node_modules/xavierdb/crud/index.ts",
    crud
  );
  // write package.json
  fs.writeFileSync(
    process.cwd() + "/node_modules/xavierdb/package.json",
    `{
  "name": "xavierdb",
  "version": "1.0.0",
  "main": "index.js",
  "types": "index.d.ts",
  "scripts": {
    "test": "echo \\"Error: no test specified\\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "jsonwebtoken": "latest"
  }
}
  `
  );
}
let args = process.argv.slice(2);
if(!fs.existsSync(process.cwd() + "/schema.cbf") && !args[0] || !fs.existsSync(process.cwd() + "/schema.cbf") && !args[0].startsWith("--init")){
  throw new Error("Please run xavier --init")
}
 
if (!fs.existsSync(process.cwd() + "/data")) {
  fs.mkdirSync(process.cwd() + "/data");
}
if (!fs.existsSync(process.cwd() + "/data/db.sqlite")) {
  fs.writeFileSync(process.cwd() + "/data/db.sqlite", "");
}
if (!fs.existsSync(process.cwd() + "/node_modules")) {
  fs.mkdirSync(process.cwd() + "/node_modules");
}
if (!fs.existsSync(process.cwd() + "/logs")) {
  fs.mkdirSync(process.cwd() + "/logs");
}
if (args[0] && args[0].startsWith("--help")) {
  switch (true) {
    case args.includes("--help-env"):
      console.log(
        `
Environment Variables
------
${env_example}
   `.trim()
      );
  }
  console.log(
    `\n
--help - Show help
--help-env - Show environment variables
--version - Show version
--init - Initialize the project
--serve - Start the server
  `.trim()
  );
  process.exit(0);
}
if (args.includes("--version")) {
  console.log(
    `
Xavier v1.0.0
Codename: Xenofon
`.trim()
  );
  process.exit(0);
}

if (args.includes("--init")) {
  if (fs.existsSync(process.cwd() + "/routes")) {
    console.error("Project already initialized");
    process.exit(1);
  }
  if (!fs.existsSync(process.cwd() + "/uploads")) {
    fs.mkdirSync(process.cwd() + "/uploads");
  }
  if (!fs.existsSync(process.cwd() + "/config.ts")) {
    fs.writeFileSync(
      process.cwd() + "/schema.cbf",
      `
    collection users {
      name: text & required,
      email: text  & required,
    }
    end;
    `.trim()
    );
  }
  if (!fs.existsSync(process.cwd() + "/routes")) {
    fs.mkdirSync(process.cwd() + "/routes");
    fs.writeFileSync(
      process.cwd() + "/routes/index.ts",
      `
    import xavier from "xavierdb/client";
    export default function GET (req: typeof RequestData) {
      return new Response(JSON.stringify({message: "Hello World"}), {
        status: responseCodes.ok,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }); 
  }`.trim()
    );
    fs.writeFileSync(process.cwd() + "/.env", env_example);
  }

  console.log(`
  ${ansiColors.green("✨ Project initialized successfully ✨")}
  To start the server run the following command:
  ${ansiColors.blue("xavier --serve")}
  `);
  process.exit(0);
}

if (fs.existsSync(process.cwd() + "/schema.cbf")) {
  !fs.existsSync(process.cwd() + "/node_modules/xavierdb") &&
    fs.mkdirSync(process.cwd() + "/node_modules/xavierdb");
  !fs.existsSync(process.cwd() + "/node_modules/xavierdb/client") &&
    fs.mkdirSync(process.cwd() + "/node_modules/xavierdb/client");
  let schema = await import(process.cwd() + "/schema/schema.json").then(
    (mod) => mod.default
  );
  schema.collections = schema.collections.map((collection) => {
    Object.assign(collection, {
      $: {
        name: collection.name,
        fields: collection.fields,
        required: collection.required,
        relations: collection.relations,
      },
    });
    return collection;
  });
  generateTypes(schema);
  fs.writeFileSync(
    process.cwd() + "/node_modules/xavierdb/client/index.ts",
    `
   //@ts-nocheck  
   import crud from "xavierdb/crud"; 
${schema.collections
  .map((collection, index) => {
    return ` 
    import ${collection.name} from "xavierdb/types/${collection.name}";
    var crud${collection.name} = crud.schema({
      name: "${collection.name}",
      fields: ${JSON.stringify(collection.fields)},
      required: ${JSON.stringify(collection.required || [])},
      relations: ${JSON.stringify(
        collection.relations.length > 0 ? collection.relations : []
      )},
      auth: ${collection.auth || false}
    })
    var crud${index} = {
      schema: function(schema: any) {
        return {
          /** 
           * @method insertOne
           * @description Insert a single document into the ${
             collection.name
           } collection
           * @param data ${collection.name}
           * @returns { ${collection.name}}
           * */
          insertOne: async function(data:  ${collection.name}) {
            return crud${collection.name}.insertOne(data) as ${collection.name};
          },
          /**
           * @method update
           * @description Update a single document in the ${
             collection.name
           } collection
           * @param id any
           * @param data ${collection.name}
           * @returns { ${collection.name}}
           * */
          update: async function(id: any, data: ${collection.name}) {
             return  await crud${collection.name}.update(id, data) as ${
      collection.name
    };
          },
          /**
           * @method uplaod 
           * @description Upload a file to the given collection
           * @param req Request
           * @param filename string
           * @param collection string
           * @returns {id: string, path:string, url:string}
           * 
           */
          upload: async function(req: Request, data:{filename: string, collection: string}) {
            let formData = await req.formData();
            if(!formData) return  {error: "No file provided"}
            if(!formData.has("file")) return {error: "No file provided"} 
            return await crud${
              collection.name
            }.upload(formData.get("file"), data) as any;
          },
          /**
           * @method delete
           * @description Delete a single document in the ${
             collection.name
           } collection
           * @param id any
           * @returns {boolean}
           * */
          delete: async function(id: any) {
             return  await crud${collection.name}.delete(id) as boolean;
          }, 
          /**
           * @method findOne
           * @description Find a single document in the ${
             collection.name
           } collection by id
           * @param id any
           * @returns { ${collection.name}} 
           * */
          findOne: async function(id: any) {
             return await crud${collection.name}.findOne(id) as ${
      collection.name
    };
          },
          /**
           * @method match
           * @description Find multiple documents in a collection that match the query
           * @param query  
           * @param options 
           * @returns 
           */
          match: async function( query: { where?:{
            contains?: { [key: string]: any },
            equals?: any;
            greaterThan?: any;
            greaterThanOrEqual?:any;
            lessThanOrEqual?: {value: any, field: string},
            lessThan?: any;
            notEqual?: {value: any, field: string},
            notContains?: { [key: string]: any },
            notEqual?: any; 
            in?: [string],
            notIn?: [string],
            notContains?: any | {[key: string]: any},
           }; id?: any },
           options: { limit?: number | undefined, sort?: 'asc' | 'desc' | undefined}) {
             return await crud${collection.name}.match(query, options) as ${
      collection.name
    }[];
           },
           /**
            * @method insertMany
            * @description Insert multiple documents into the ${
              collection.name
            } collection
            * @param data ${collection.name}s
            * @returns { ${collection.name}[]}
            * */
          insertMany: async function(data: ${collection.name}[]) {
             return await crud${collection.name}.insertMany(data) as ${
      collection.name
    }[];
          } ,
          /**
           * @method deleteMany
           * @description Delete multiple documents in the ${
             collection.name
           } collection
           * @param query any
           * @returns {boolean}
           * */
          deleteMany: async function(query: any) {
             return await crud${collection.name}.deleteMany(query) as boolean;
          },
          /**
           * @method updateMany
           * @description Update multiple documents in the ${
             collection.name
           } collection
           * @param query any
           * @param data ${collection.name}
           * @returns [{ ${collection.name}}]
           * */
          updateMany: async function(query: any, data:${collection.name}) {
             return await crud${collection.name}.updateMany(query, data) as ${
      collection.name
    };
          },
          /**
           * @method count
           * @description Count the number of documents in the ${
             collection.name
           } collection
           * @param query any
           * @returns {number}
           * */
          count: async function(query: any) {
            return await crud${collection.name}.count(query) as number;
          },
          /**
           * @method getAll 
           * @description Get all documents in the ${collection.name} collection
           * @returns { ${collection.name}[]}
           * */
          getAll: async function() {
            return await crud${collection.name}.getAll() as ${
      collection.name
    }[];
          },
          /**
           * @method authWithPassword 
           * @description Authenticate a user with a password
           * @param  EmailOrUsername string
           * @param password string
           * @returns {${collection.name}}
           * */
          authWithPassword: async function(data:{EmailOrUsername: string, password: string}) {
            return await crud${collection.name}.authWithPassword(data) as ${
      collection.name
    };
    
          },
          /**
           * @method on 
           * @description Listen to changes in the posts collection
           * @param event string
           * @param callback Function
           * @returns {void}
           */
          on: async function(event: string, callback: Function) {
            return await crud${collection.name}.on(event, callback);
          }
        }
      } 
    }
      
    `;
  })
  .join(";\n")}
 
export const sync =  async function() {
  return await crud.sync();

}

declare global {
  var RequestData: Request & {
    params: {
      [key: string]: any;
    };
    query: {
      [key: string]: any; 
    }
  };

}


export default {
  sync, 
  jwt: crud.jwt,
  ${schema.collections
    .map((collection, index) => {
      return `
${collection.name}: crud${index}.schema({
name: "${collection.name}",
fields: ${JSON.stringify(collection.fields)},
required: ${JSON.stringify(collection.required || [])},
relations: ${JSON.stringify(collection.relations || [])},
auth: ${collection.auth || false}
})  
           `;
    })
    .join(",\n")}
   
}`
  );
}

let xavier = await import(
  process.cwd() + "/node_modules/xavierdb/client/index.ts"
).then((mod) => mod.default);
xavier.sync();

 

 
function generateTypes(config: any) {
  // generate types from config
  config.collections.map((collection) => {
    collection.$.fields["created_at"] = "Date";
    collection.$.fields["updated_at"] = "Date";
    collection.$.fields["id"] = "any";
    collection.$.fields["error"] = "null | Object";
    let keys = Object.keys(collection.$.fields);
    let required = collection.$.required || [];
    let fields = keys
      .map((key) => {
        let type = collection.$.fields[key].toLowerCase();
        switch (true) {
          case type === "text":
            type = "string";
            break;
          case type === "integer":
            type = "number";
            break;
          case type === "real":
            type = "number";
            break;
          case type === "date":
            type = "Date";
            break;
          case type === "blob":
            type = "ArrayBuffer";
            break;
          default:
            type = "any";
            break;
        }
        if (key === "created_at") return `${key}?: Date`;
        if (key === "updated_at") return `${key}?: Date`;
        return `${key}${required.includes(key) ? "" : "?"}: ${type}`;
      })
      .join(", ");
    fs.mkdirSync(
      process.cwd() + `/node_modules/xavierdb/types/${collection.$.name}`,
      { recursive: true }
    );
    fs.writeFileSync(
      process.cwd() + "/node_modules/xavierdb/index.d.ts",
      type.trim()
    );
    fs.writeFileSync(
      process.cwd() +
        `/node_modules/xavierdb/types/${collection.$.name}/index.d.ts`,
      `export   type ${collection.$.name} = {${fields}}; export default ${collection.$.name} `
    );
  });
}

if (args.includes("--serve")) {
  var rateLimitBucket = []; 
  globalThis.compression_level = process.env.COMPRESSION_LEVEL || 1; // 1-9
 

  if (!process.env.HTTP_REQUEST_PORT) {
    console.error("HTTP_REQUEST_PORT environment variable is required");
    process.exit(1);
  }
  if (!process.env.TOKEN_SECRET) {
    console.error("TOKEN_SECRET environment variable is required");
    process.exit(1);
  }

  if (!fs.existsSync(process.cwd() + "/routes")) {
    console.error(
      "routes directory is required run xavier --init to initialize the project"
    );
    process.exit(1);
  }

  //@ts-ignore

  var config;

  if (!fs.existsSync(process.cwd() + "/schema.cbf")) {
    throw new Error("Schema file not found");
  }

  const routes = new globalThis.Bun.FileSystemRouter({
    style: "nextjs",
    dir: process.cwd() + "/routes",
  });
  globalThis.wssClients = [];
  function parseToSeconds(time: string) {
    if (!time) return null;
    let seconds = 0;
    let timeArray = time.split("");
    let timeUnit = timeArray[timeArray.length - 1];
    let timeValue = parseInt(timeArray.slice(0, timeArray.length - 1).join(""));
    switch (timeUnit) {
      case "s":
        seconds = timeValue;
        break;
      case "m":
        seconds = timeValue * 60;
        break;
      case "h":
        seconds = timeValue * 60 * 60;
        break;
      case "d":
        seconds = timeValue * 60 * 60 * 24;
        break;
      case "w":
        seconds = timeValue * 60 * 60 * 24 * 7;
        break;
      case "y":
        seconds = timeValue * 60 * 60 * 24 * 365;
        break;
      default:
        seconds = 0;
        break;
    }
    return seconds * 1000;
  }
  setInterval(() => {
    for (let i = 0; i < rateLimitBucket.length; i++) {
      if (
        rateLimitBucket[i].uses >= process.env.RATELIMITS_MAX_REQUESTS ||
        100
      ) {
        console.log(
          `Removed token ${rateLimitBucket[i].token.slice(0, 5)} from bucket: ${
            rateLimitBucket[i].uses
          } requests`
        );
        rateLimitBucket.splice(i, 1);
      }
    }
  }, parseToSeconds(process.env.RATELIMITS_WINDOW) || 1000);
  
  console.log(process.env.HTTPS_ENABLED)
  Bun.serve({
    port: process.env.HTTP_REQUEST_PORT || 3000,
    ...(
      process.env.HTTPS_ENABLED ? {
        tls:{
          key: Bun.file(process.cwd() +'/' + process.env.HTTPS_KEY),
          cert: Bun.file(process.cwd() +'/' + process.env.HTTPS_CERT)
        }
      } : {}
    ), 
    websocket: {
      async open(ws) {
        ws.send(JSON.stringify({ message: "connected" }));
        globalThis.wssClients.push(ws);
      },
      async message(ws) {
        console.log("message");
      },
      async close(ws) {
        globalThis.wssClients = globalThis.wssClients.filter(
          (client) => client !== ws
        );
      },
    },
    async fetch(req, res) {
      let url = new URL(req.url);
      if (res.upgrade(req) && url.pathname === "/ws/realtime") {
        return new Response(null, { status: 101 });
      }
      if (url.pathname.startsWith("/files")) {
        var collection = url.pathname.split("/files/")[1].split("/")[0];
        var f = url.pathname.split(collection + "/")[1];
        if (!fs.existsSync(process.cwd() + `/uploads/${collection}/${f}`)) {
          return new Response("404 Not Found", {
            status: responseCodes.notfound,
          });
        }
        let fileStream = fs.readFileSync(
          process.cwd() + `/uploads/${collection}/${f}`
        );
        let headers = {
          "Content-Type": await file(
            process.cwd() + `/uploads/${collection}/${f}`
          ).type,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Authorization-Session, content-type, Authorization",
          "Content-Encoding": "gzip",
        };
        let stats = fs.statSync(process.cwd() + `/uploads/${collection}/${f}`);
        headers["Content-Length"] = stats.size;
        return new Response(Bun.gzipSync(fileStream), {
          status: responseCodes.ok,
          headers: headers,
        });
      }

       

      // if bucket doesnt include token, add it
      if (
        req.headers.get("Authorization-Session") &&
        !rateLimitBucket.find(
          (bucket) => bucket.token === req.headers.get("Authorization-Session")
        )
      ) {
        rateLimitBucket.push({
          token: req.headers.get("Authorization-Session"),
          time: Date.now(),
          lastTime: Date.now(),
          uses: 0,
        });
        console.log(
          `Added token ${req.headers
            .get("Authorization-Session")
            .slice(0, 5)} to bucket`
        );
      }
      try {
        if (
          process.env.RATELIMITS_ENABLED &&
          url.pathname === "/auth/session"
        ) {
          if (req.method.toLowerCase() === "options") {
            return new Response(null, {
              status: responseCodes.ok,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers":
                  "Authorization-Session, content-type, Authorization",
              },
            });
          }
          let token = jwt.sign(
            { id: Math.random() },
            process.env.TOKEN_SECRET || "secret",
            { expiresIn: "1h" }
          );
          rateLimitBucket.push({
            token,
            time: Date.now(),
            lastTime: Date.now(),
            uses: 0,
          });
          return new Response(token, {
            status: responseCodes.ok,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers":
                "Authorization-Session, content-type, Authorization",
            },
          });
        }
        if (
          process.env.RATELIMITS_ENABLED &&
          !req.headers.get("Authorization-Session")
        ) {
          if (req.method.toLowerCase() === "options") {
            return new Response(null, {
              status: responseCodes.ok,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers":
                  "Authorization-Session, content-type, Authorization",
              },
            });
          }
          return new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: responseCodes.unauthorized,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers":
                "Authorization-Session, content-type, Authorization",
            },
          });
        }
        if (process.env.RATELIMITS_ENABLED) {
          function Res() {
            return new Response(JSON.stringify({ message: "Unauthorized" }), {
              status: responseCodes.unauthorized,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers":
                  "Authorization-Session, content-type, Authorization",
              },
            });
          }
          try {
            jwt.verify(
              req.headers.get("Authorization-Session"),
              process.env.TOKEN_SECRET || "secret"
            );
          } catch (error) {
            return Res();
          }
          let verified = jwt.verify(
            req.headers.get("Authorization-Session"),
            process.env.TOKEN_SECRET || "secret"
          );
          let exp = verified.exp;

          if (Date.now() >= exp * 1000) {
            return Res();
          }
          if (!verified) {
            return Res();
          }
        }
        let token = req.headers.get("Authorization-Session") || "";
        let bucket =
          rateLimitBucket.find((bucket) => bucket.token.toString() === token) ||
          0;
        if (process.env.RATELIMITS_ENABLED) {
          if (bucket === 0) {
            console.log("Bucket not found");
            rateLimitBucket.push({
              token,
              time: Date.now(),
              lastTime: Date.now(),
              uses: 0,
            });
          } else {
            if (
              bucket.uses >=
              (parseInt(process.env.RATELIMITS_MAX_REQUESTS) || 100)
            ) {
              if (req.method.toLowerCase() === "options") {
                return new Response(null, {
                  status: responseCodes.ok,
                  headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers":
                      "Authorization-Session, content-type, Authorization",
                  },
                });
              }
              return new Response(
                JSON.stringify({ message: "Too many requests" }),
                {
                  status: responseCodes.tooManyRequests,
                  headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers":
                      "Authorization-Session, content-type, Authorization",
                  },
                }
              );
            }
          }
        }
        if (bucket) {
          bucket.uses += 1;
          bucket.lastTime = Date.now();
          rateLimitBucket = rateLimitBucket.map((b) => {
            if (b.token === token) {
              return bucket;
            }
            return b;
          });
        }
      } catch (error) {
        return new Response("500 Internal Server Error", {
          status: responseCodes.internalservererror,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      let path = url.pathname;
      let route = routes.match(path);

      try {
        if (route) {
          let mod = await import(route.filePath);
          let requestSize = req.headers.get("content-length");
          if (requestSize && process.env.HTTP_MAX_REQUEST_SIZE) {
            if (
              parseInt(requestSize) >=
              parseInt(process.env.HTTP_MAX_REQUEST_SIZE)
            ) {
              return new Response(
                `Request size exceeded ${process.env.HTTP_MAX_REQUEST_SIZE} bytes`,
                {
                  status: responseCodes.payloadtoolarge,
                }
              );
            }
          }
          if (!mod.default) {
            return new Response("404 Not Found", {
              status: responseCodes.notfound,
            });
          }
          let name = mod.default.name.toLowerCase();
          try{ 
            if (name === "options") {
              return mod.default(req);
            }
  
          } catch (error) {
            return new Response("405 Method Not Allowed", {
              status: responseCodes.methodnotallowed,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers":
                  "Authorization, content-type, Authorization-Session",
              },
            });
          }
          if (req.method.toLowerCase() === "options") {
            return new Response(null, {
              status: responseCodes.ok,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers":
                  "Authorization, content-type, Authorization-Session",
              },
            });
          }
          if (req.method.toLowerCase() !== mod.default.name.toLowerCase()) {
            return new Response("405 Method Not Allowed", {
              status: responseCodes.methodnotallowed,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers":
                  "Authorization, content-type, Authorization-Session",
              },
            });
          }
          req.params = route.params || {};
          req.query = Object.fromEntries(url.searchParams.entries());
           try {
            let response = await mod.default(req);
            return response;
           } catch (error) {
            if (process.env.LOG_LEVEL?.toLocaleLowerCase() === "error") {
              console.error(error);
              throw new Error(error);
            }
            return new Response("500 Internal Server Error", {
              status: responseCodes.internalservererror,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers":
                  "Authorization, content-type, Authorization-Session",
              },
            });
           }
        } else {
          return new Response("404 Not Found", {
            status: responseCodes.notfound,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers":
                "Authorization, content-type, Authorization-Session",
            },
          });
        }
      } catch (error) {
        if (process.env.LOG_LEVEL?.toLocaleLowerCase() === "error") {
          console.error(error);
          throw new Error(error);
        }
        return new Response("500 Internal Server Error", {
          status: responseCodes.internalservererror,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "Authorization, content-type, Authorization-Session",
          },
        });
      }
    },
  });
  console.log(
    `
🚀 Api running @ ${ansiColors.blue(
      `${process.env.HTTPS_ENABLED ? "https" : "http"}://localhost:${process.env.HTTP_REQUEST_PORT}`
    )}
Websocket running @ ws://localhost:${process.env.HTTP_REQUEST_PORT}/ws/realtime

Listening to : ${Object.keys(routes.routes).join(", ")}
   
${ansiColors.green("✨ Server started successfully ✨")}
Press Ctrl + C to stop the server
`.trim()
  );
  globalThis.serverRunning = true;
}
process.on("unhandledRejection", (reason, promise) => {
  xavier.sync();
  console.error(reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error(error);
  xavier.sync();
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("Server stopped");
  xavier.sync();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Server stopped");
  xavier.sync();
  process.exit(0);
});

if (!globalThis.serverRunning) {
  console.log(
    `
--help - Show help
--help-env - Show an example of used environment variables
--version - Show version
--init - Initialize the project
--serve - Start the server
  `.trim()
  );
  process.exit(0);
}
