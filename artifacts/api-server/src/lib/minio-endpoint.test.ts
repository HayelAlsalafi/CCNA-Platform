import {it,expect,vi} from "vitest";
vi.mock("@workspace/db",()=>({db:undefined}));
import {mediaEndpoint} from "./lesson-media-storage";
it("allows exactly development MinIO HTTP and preserves HTTPS storage",()=>{
  expect(mediaEndpoint("http://127.0.0.1:9000","development").origin).toBe("http://127.0.0.1:9000");
  expect(mediaEndpoint("https://s3.us-east-1.amazonaws.com","production").protocol).toBe("https:");
});
it.each(["http://localhost:9000","http://127.0.0.1:9001","http://192.168.1.1:9000","http://127.0.0.1:9000/path","http://user:secret@127.0.0.1:9000","http://127.0.0.1:9000?key=x"])("rejects other insecure endpoints %s",value=>expect(()=>mediaEndpoint(value,"development")).toThrow());
it("never permits HTTP in production or an unspecified environment",()=>{
  expect(()=>mediaEndpoint("http://127.0.0.1:9000","production")).toThrow();
  expect(()=>mediaEndpoint("http://127.0.0.1:9000","test")).toThrow();
});
