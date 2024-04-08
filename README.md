# Xavierdb
A high performance sqlite database built ontop of bun.js

# Installation

1. Install [Bun.js](https://bun.sh/docs/installation) if not already installed
2. Download a [release](https://github.com/MalikWhitten67/xavierdb/releases) for your system whether linux macos or windows.

# Use as standalone app

You could download the prebuilt executable for your platform from the [Releases Tab](https://github.com/MalikWhitten67/xavierdb/releases/latest). Once downloaded, extract the 
archive  

Create a config.ts file and a .env file

```ts
// config.ts

// crud is a global method so all you have to do is call it within collections
export default {
    collections: [
        crud.schema({
            name: "posts",
            required: ["title", "content", "author"],
            related: {
              users: {
                 field: "author",
              }
            },
            fields: {
              title: "TEXT",
              content: "TEXT",   
              author: "TEXT"
            },
        }),
        crud.schema({
            name: "users",
            auth: true,
            required: ["name", "email"],
            updatable: ["name", "email"],
            restrict: true, // only the owner can update / delete
            fields: {
              name: "TEXT",
              email: "TEXT",   
              password: "TEXT",
              verifiedStatus: "TEXT",
            },
        }),
    ]
}
```
Now that you have configured your collection schemes it will generate types based off of that
Next is creating a .env file to hide some stuff

```env
HTTP_REQUEST_PORT=8080
DATA_DIR=/data # directory where the data is stored
LOG_DIR=/logs # directory where the logs are stored
CPU_LIMIT=1000 # higher the number the more verbose
MEMORY_LIMIT=512M # limit how  much ram can be consumed by the process 
COMPRESSION_LEVEL=1
LOG_LEVEL=ERROR
SECRET_KEY=secret # used for authentication token validation
```
almost done all you have to do is define routes - create a routes folder if not done already - this folder allows you to use a filebased routing approach similar to nextjs to define api routes,
this is where all custom validation goes.

```ts
// routes/index.ts
import  config from '../config.ts';
import { posts } from '../types/types.ts'; // folder with generated types

const crud = config.collections[1];
   
export default function GET(req: typeof RequestData) {     
  return new Response(
    JSON.stringify(
      crud.getAll()
    ),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

```
Lastly run `./xavier` 

# Build yourself

Simply clone the project then extract and run `bun build ./entry.ts  --compile --outfile ./outfolder` it will take your custom code and turn it into an executable
