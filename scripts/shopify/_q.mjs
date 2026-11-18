import { gql, config } from './lib.mjs';
import { readFileSync } from 'node:fs';
const cfg=config();
const code=s=>(String(s).toUpperCase().replace(/\s+/g,'').match(/^([A-Z]+\d+)/)||[])[1];
const sheet=new Set(readFileSync('scripts/shopify/client-prices.csv','utf8').trim().split('\n').slice(1).map(l=>code(l.split(',')[0])));
const store=new Map(); let after=null;
do { const r=await gql(cfg,`query($a:String){productVariants(first:250,after:$a){pageInfo{hasNextPage endCursor} nodes{sku price product{status}}}}`,{a:after});
 for(const v of r.productVariants.nodes){const c=code(v.sku); if(c) store.set(c,[...(store.get(c)||[]),[v.product.status,+v.price]]);}
 after=r.productVariants.pageInfo.hasNextPage?r.productVariants.pageInfo.endCursor:null; } while(after);
console.log('sheet codes not in store:',[...sheet].filter(c=>!store.has(c)).join(' '));
console.log('zero-priced active variants:',[...store].filter(([c,vs])=>vs.some(([s,p])=>s==='ACTIVE'&&p===0)).map(([c])=>c).join(' ')||'none');
console.log('draft codes:',[...store].filter(([c,vs])=>vs.every(([s])=>s==='DRAFT')).map(([c])=>c).join(' '));
