import fs from "fs";
import crud from "./CRUD";
import jwt from 'jsonwebtoken';
import './index.ts';
if (!fs.existsSync(process.cwd() + "/data")) {
  fs.mkdirSync(process.cwd() + "/data");
}
if (!fs.existsSync(process.cwd() + "/data/db.sqlite")) {
  fs.writeFileSync(process.cwd() + "/data/db.sqlite", "");
}
if (!process.env.HTTP_REQUEST_PORT) {
  console.error("HTTP_REQUEST_PORT environment variable is required");
  process.exit(1);
}
if (!fs.existsSync(process.cwd() + "/config.ts")) {
  console.error("config.ts file is required");
  process.exit(1);
}
if(!fs.existsSync(process.cwd() + "/types")) {
  fs.mkdirSync(process.cwd() + "/types");
fs.writeFileSync(process.cwd() + "/types/types.ts", `
type Schema = {
  /**
   * @description The name of the collection
   */
 name: string,
   /**
         * @private;
         */ 
 required?: any[],
/**
          * @description The updateable object is used to determine which fields can be updated by the user.
          * @param for The field that is used to determine if the user is the owner
          * @param owner The fields that can be updated by the owner
          * @param other The fields that can be updated by other users
          */
  updateable?: {
          for: string,
          owner: () => string[],
          other: () => string[]
  },
  fields: {
      [key: string]: string
  },
  deletable?: {
          for: string,
          owner: boolean,
          other: boolean
  },
  viewable?: {
          for: string,
          owner: () => string[],
          other: () => string[]
  },
    /**
         * @description The related object is used to determine which fields are related to other collections
         * @param key The name of the related collection
         * @param fields The fields that are related to the collection
         */
  related?: {
      [key: string]: {
          fields: string[]
      }
  },
     /**
         * @description The restrict object is used to determine if the user can update or delete the collection
         */
  restrict?: boolean,
  auth?: boolean, 
}
declare global {
var crud: {
    schema(data: Schema): {
      /**
       * @description The admin object allows you to use custom validation and logic for the collection bypassing schema restrictions and authentication
       */
      admin: {
        insertOne: (data: any) => {
              id: any,
              created_at: Date,
              updated_at: Date, 
              [key: string]: any,
              error: null | string
        }
        getAll: () => [{
              id: any,
              created_at: Date,
              updated_at: Date,
              [key: string]: any
        }]
        viewAll: () =>  [{
              id: any,
              created_at: Date,
              updated_at: Date,
              [key: string]: any
        }]
        update: (id: string, data: any) => {
              id: any,
              created_at: Date,
              updated_at: Date, 
              [key: string]: any,
              error: null | string
        }
        delete: (id: string) => {
              id: any,
              created_at: Date,
              updated_at: Date, 
              [key: string]: any,
              error: null | string
        }
    }
        
        /**
         * @description The restrict object is used to determine if the user can update or delete the collection
         */
        restrict: boolean,
        /**
         * @description The auth object is used to determine if the collection requires authentication
         */
        auth: boolean,
        /**
         * @description Insert a new document into the collection
         * @param id The id of the document 
         * @param data The data to insert into the collection
         * @returns The new document
         */
        insertOne: (data: any) => {
            id: any,
            created_at: Date,
            updated_at: Date, 
            [key: string]: any
        }
        /**
         * 
         * @param query  The query to match documents 
         * @description Match documents in the collection
         * @returns 
         */
        match: (query: {
            [key: string]: any
            id?: any
        }) =>  [{
            id: any,
            created_at: Date,
            updated_at: Date, 
            [key: string]: any
        }],
        /**
         * @description Update a document in the collection
         * @param id The id of the document
         * @param data 
         * @returns 
         */
        update: (id: string, data: any) =>  {
            id: any,
            created_at: Date,
            updated_at: Date, 
            [key: string]: any
        }
        /**
         * @description Find a document based on the id
         * @param id The id of the document
         * @returns 
         */
        findOne: (id: string) =>  {
            id: any,
            created_at: Date,
            updated_at: Date,
            [key: string]: any
        }, 
        /**
         * @description Get all documents in the collection
         * @returns All documents in the collection
         */
        getAll: () => [{
            id: any,
            created_at: Date,
            updated_at: Date,
            [key: string]: any
        }],
        /**
         * @description Authenticate with a password
         * @param data  The data to authenticate with
         * @returns 
         */
        authWithPassword: (data:{email: string, password: string}) => {
            id: any,
            created_at: Date,
            updated_at: Date, 
            error: null | string,
            token: string,
            [key: string]: any
        },
        /**
         * @description Delete a document in the collection
         * @param id The id of the document
         * @returns 
         */
        delete: (id: string) => any
    };
    /**
     * @description Log unreachable errors to data/logs.txt
     * @param message 
     * @returns 
     */
    error: (message: string) => any
    /**
     * @description Sync the collections with the database
     * @returns void
     */
    sync(): void
    /**
     * @description Holder for all schemas
     * @returns []
     */
    collections: any[] 
}
var RequestData: Request  & { 
    params: {
        [key: string]: any
    }
}
}
`);
}
if (!fs.existsSync(process.cwd() + "/routes")) {
  console.error("routes directory is required");
  process.exit(1);
}
 
//@ts-ignore
globalThis.crud = crud;
const config = (await import(process.cwd() + "/config.ts").then(
  (mod) => mod.default
)) as any;
// generate types from config
var types = config.collections.map((collection) => {
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
      if (key === "created_at") return `${key}: Date`;
      if (key === "updated_at") return `${key}: Date`;
      return `${key}${required.includes(key) ? "" : "?"}: ${type}`;
    })
    .join(", ");
  return `export type ${collection.$.name} = {${fields}}`;
});

let memoryLimit = process.env.MEMORY_LIMIT || 1000000;
let cpuLimit = process.env.CPU_LIMIT || 100;
globalThis.compression_level = process.env.COMPRESSION_LEVEL || 1; // 1-9
function watchMemory() {
  let used = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  let cpu = process.cpuUsage().user / 1000;
  //@ts-ignore
  if (used > memoryLimit) {
    console.error(`Memory limit exceeded ${used}MB`);
    process.exit(1);
  }
  //@ts-ignore
  if (cpu > cpuLimit) {
    console.error(`CPU limit exceeded ${cpu}`);
    process.exit(1);
  }
}

setInterval(watchMemory, 1000);

types = types.join("\n") as any;
types += `
type Schema = {
  /**
   * @description The name of the collection
   */
 name: string,
   /**
         * @private;
         */ 
 required?: any[],
/**
          * @description The updateable object is used to determine which fields can be updated by the user.
          * @param for The field that is used to determine if the user is the owner
          * @param owner The fields that can be updated by the owner
          * @param other The fields that can be updated by other users
          */
  updateable?: {
          for: string,
          owner: () => string[],
          other: () => string[]
  },
  fields: {
      [key: string]: string
  },
  deletable?: {
          for: string,
          owner: boolean,
          other: boolean
  },
  viewable?: {
          for: string,
          owner: () => string[],
          other: () => string[]
  },
    /**
         * @description The related object is used to determine which fields are related to other collections
         * @param key The name of the related collection
         * @param fields The fields that are related to the collection
         */
  related?: {
      [key: string]: {
          fields: string[]
      }
  },
     /**
         * @description The restrict object is used to determine if the user can update or delete the collection
         */
  restrict?: boolean,
  auth?: boolean, 
}
declare global {
var crud: {
    schema(data: Schema): {
      /**
       * @description The admin object allows you to use custom validation and logic for the collection bypassing schema restrictions and authentication
       */
      admin: {
        insertOne: (data: any) => {
              id: any,
              created_at: Date,
              updated_at: Date, 
              [key: string]: any,
              error: null | string
        }
        getAll: () => [{
              id: any,
              created_at: Date,
              updated_at: Date,
              [key: string]: any
        }]
        viewAll: () =>  [{
              id: any,
              created_at: Date,
              updated_at: Date,
              [key: string]: any
        }]
        update: (id: string, data: any) => {
              id: any,
              created_at: Date,
              updated_at: Date, 
              [key: string]: any,
              error: null | string
        }
        delete: (id: string) => {
              id: any,
              created_at: Date,
              updated_at: Date, 
              [key: string]: any,
              error: null | string
        }
    }
        
        /**
         * @description The restrict object is used to determine if the user can update or delete the collection
         */
        restrict: boolean,
        /**
         * @description The auth object is used to determine if the collection requires authentication
         */
        auth: boolean,
        /**
         * @description Insert a new document into the collection
         * @param id The id of the document 
         * @param data The data to insert into the collection
         * @returns The new document
         */
        insertOne: (data: any) => {
            id: any,
            created_at: Date,
            updated_at: Date, 
            [key: string]: any
        }
        /**
         * 
         * @param query  The query to match documents 
         * @description Match documents in the collection
         * @returns 
         */
        match: (query: {
            [key: string]: any
            id?: any
        }) =>  [{
            id: any,
            created_at: Date,
            updated_at: Date, 
            [key: string]: any
        }],
        /**
         * @description Update a document in the collection
         * @param id The id of the document
         * @param data 
         * @returns 
         */
        update: (id: string, data: any) =>  {
            id: any,
            created_at: Date,
            updated_at: Date, 
            [key: string]: any
        }
        /**
         * @description Find a document based on the id
         * @param id The id of the document
         * @returns 
         */
        findOne: (id: string) =>  {
            id: any,
            created_at: Date,
            updated_at: Date,
            [key: string]: any
        }, 
        /**
         * @description Get all documents in the collection
         * @returns All documents in the collection
         */
        getAll: () => [{
            id: any,
            created_at: Date,
            updated_at: Date,
            [key: string]: any
        }],
        /**
         * @description Authenticate with a password
         * @param data  The data to authenticate with
         * @returns 
         */
        authWithPassword: (data:{email: string, password: string}) => {
            id: any,
            created_at: Date,
            updated_at: Date, 
            error: null | string,
            token: string,
            [key: string]: any
        },
        /**
         * @description Delete a document in the collection
         * @param id The id of the document
         * @returns 
         */
        delete: (id: string) => any
    };
    /**
     * @description Log unreachable errors to data/logs.txt
     * @param message 
     * @returns 
     */
    error: (message: string) => any
    /**
     * @description Sync the collections with the database
     * @returns void
     */
    sync(): void
    /**
     * @description Holder for all schemas
     * @returns []
     */
    collections: any[] 
}
var RequestData: Request  & { 
    params: {
        [key: string]: any
    }
}
}
`;

fs.mkdirSync(process.cwd() + "/types", { recursive: true });
fs.writeFileSync(process.cwd() + "/types/types.ts", types);
//@ts-ignore
globalThis.crud = crud;
export const bc = new BroadcastChannel("crud");
import { responseCodes } from "./enums/http_response_codes";

const routes = new globalThis.Bun.FileSystemRouter({
  style: "nextjs",
  dir: process.cwd() + "/routes",
});
globalThis.wssClients = [];

export default {
  port: process.env.HTTP_REQUEST_PORT || 3000,
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
    let path = url.pathname;
    let route = routes.match(path); 
    if (
      url.pathname.includes("/collection/") &&
      req.method.toLowerCase() === "options"
    ) {
      return new Response(null, {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    if (path === "/verifyToken" && req.method.toLowerCase() === "options") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization",
        },
      });
    }
    if (path === "/verifyToken" && req.method.toLowerCase() === "post") {
      let token = req.headers.get("Authorization")?.split("Bearer ")[1] || ""; 
      if (!token) {
        return new Response(JSON.stringify({ error: "401 Unauthorized" }), {
          status: responseCodes.unauthorized,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } 
      if (!(await  jwt.verify(token, process.env.SECRET_KEY, {algorithms: ['HS256']}) )) {
        return new Response(JSON.stringify({ error: "401 Unauthorized" }), {
          status: responseCodes.unauthorized,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      return new Response(JSON.stringify({ message: "200 OK" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (url.pathname.includes("/collection/")) {
      let name = url.pathname.split("/")[2];
      let method = url.pathname.split("/")[3]  
      if(method === "getAll"){
        let collection = config.collections.find(
          (collection) => collection.$.name === name
        );
        if (!collection) {
          return new Response("404 Not Found", {
            status: responseCodes.notfound,
          });
        }
        let response = await collection[method]({ token: req.headers.get("Authorization")?.split("Bearer ")[1] || "" });
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      let data = await req.json();
      let collection = config.collections.find(
        (collection) => collection.$.name === name
      );
      if (!collection) {
        return new Response("404 Not Found", {
          status: responseCodes.notfound,
        });
      }
      if (!collection[method]) {
        return new Response("404 Not Found", {
          status: responseCodes.notfound,
        });
      }
      if (method === "getOne") {
        let options = data.options || {};
        data = data.id;
        options.token = req.headers.get("Authorization")?.split("Bearer ")[1] || "";
        return new Response(
          JSON.stringify(await collection[method](data, options)),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (method === "update") { 
        if (!data.id || !data.data){
          return new Response(`Missing required fields`, {
            status: responseCodes.missingRequiredFields,
          });
        }
        
        let id = data.id; 
        let token = req.headers.get("Authorization")?.split("Bearer ")[1] || "";
        var dt = await collection[method](id, data.data, { token }); 
        return new Response(JSON.stringify(dt), { status: dt.code || 200, headers: { "Content-Type": "application/json" } }); 
      }
      if (method === "delete") {
        let id = data.id;
        let res = await collection[method](id, { token: req.headers.get("Authorization")?.split("Bearer ")[1] || "" });
        return new Response(JSON.stringify(res), {
          status: res.code || 200,
          headers: { "Content-Type": "application/json" },
        }); 
      }
      let response = await collection[method](data);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      if (route) {
        let mod = await import(route.filePath);
        if (!mod.default) {
          return new Response("404 Not Found", {
            status: responseCodes.notfound,
          });
        }
        let name = mod.default.name.toLowerCase();
        if (name === "options") {
          return mod.default(req);
        }
        if (name.includes("_authenticated")) {
          // handle options request
          if (req.method.toLowerCase() === "options") {
            return new Response(null, {
              status: 200,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Authorization",
              },
            });
          }
          let method = mod.default.name.split("_")[0];
          if (req.method.toLowerCase() !== method.toLowerCase()) {
            return new Response("405 Method Not Allowed", {
              status: responseCodes.methodnotallowed,
            });
          }
          req.authenticated_user = null;
          req.token = null;
          let { isAuthenticated, isNotAuthenticated } = mod.default(req);
          let token =   req.headers.get("Authorization")?.split("Bearer ")[1] || "";
          if (!token) {
            return isNotAuthenticated;
          }
          if (!(await crud.jwt.verify(token))) { 
            return isNotAuthenticated;
          }
          req.authenticated_user = crud.jwt.decode(token);
          req.token = token;
          return isAuthenticated;
        }
        if (req.method.toLowerCase() === "options") {
          return new Response(null, {
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
        if (req.method.toLowerCase() !== mod.default.name.toLowerCase()) {
          return new Response("405 Method Not Allowed", {
            status: responseCodes.methodnotallowed,
          });
        }
        req.params = route.params || {};
        let response = await mod.default(req);
        return response;
      } else {
        return new Response("404 Not Found", {
          status: responseCodes.notfound,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    } catch (error) {
      if (process.env.LOG_LEVEL?.toLocaleLowerCase() === "error") {
        throw new Error(error);
      }
      return new Response("500 Internal Server Error", {
        status: responseCodes.internalservererror,
      });
    }
  },
};
console.log(`Server is running on port ${process.env.HTTP_REQUEST_PORT}`);
