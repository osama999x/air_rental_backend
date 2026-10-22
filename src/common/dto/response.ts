export class ResponseDto<T> {
  constructor(message: string, data?: T | T[]) {
    this.message = message;
    this.data = data;
  }
  message: string;
  data?: T | T[];
}
