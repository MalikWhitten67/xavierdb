import config from "../../config.ts"; 
import { users } from "../../types/types.ts";
const crud = config.collections[0]

export default async function POST(req: typeof RequestData) {
  let { collection } = req.params as { collection: string };
  let body = await req.json();
  let data = body;
  try {
    let d = crud.insertOne(data) as users; 
    return new Response(JSON.stringify(crud.findOne(d.id)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
