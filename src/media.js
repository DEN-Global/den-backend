import {ensure} from './http.js';
export function image(value=''){ensure(typeof value==='string'&&value.length<=24000&&(!value||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)),400,'INVALID_IMAGE');return value;}
