declare module 'jpeg-js' {
  export function decode(data: Uint8Array, options?: Record<string, unknown>): {width:number;height:number;data:Uint8Array};
  const api:{decode:typeof decode}; export default api;
}
