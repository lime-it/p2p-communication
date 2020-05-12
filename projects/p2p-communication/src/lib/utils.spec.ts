import { flattenObject, getTransferables } from "./utils";

describe('utils', () => {

  it('flattenObject', async () => {
    let obj:any = {
      one:1,
      two:2,
      inner:{
        three:3,
        more:{
          four:4
        }
      }
    };

    const result = await flattenObject(obj);

    expect(result).toEqual([obj, 1,2,obj.inner,3, obj.inner.more,4]);

    obj.cycle = obj.inner;
    
    const result2 = await flattenObject(obj);

    expect(result).toEqual(result);
  });

  it('getTransferables', async () => {
    let obj:any = {
      one:1,
      two:new MessageChannel().port1,
      inner:{
        three:new ArrayBuffer(10),
        more:{
          five:'test'
        }
      }
    };

    const result = await getTransferables(obj);

    expect(result).toEqual([obj.two,obj.inner.three]);

    obj.cycle = obj.inner;
    
    const result2 = await getTransferables(obj);

    expect(result).toEqual(result);
  });
});
