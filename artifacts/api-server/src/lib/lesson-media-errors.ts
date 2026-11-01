import {z} from 'zod/v4';
import {LessonError} from './lessons';
export function mediaReadFailure(error:unknown):LessonError {
  if(error instanceof LessonError)return error;
  if(error instanceof z.ZodError)return new LessonError(400,'MEDIA_ID','Use a valid image identifier.');
  return new LessonError(500,'MEDIA_READ_FAILED','Image metadata could not be read. Ask an administrator to check the API diagnostics.');
}
