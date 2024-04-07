import  config from '../config.ts';
import { posts } from '../types/types.ts';

const  crud = config.collections[0];
   
export default function GET(req: typeof RequestData) {    
  let updated = crud.getAll().map((item): posts =>{ 
    let title = `${item.title}`
    crud.update(item.id, { title});
    return crud.findOne(item.id) as posts;
  })  
  return new Response(
    JSON.stringify(
      updated
    ),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
