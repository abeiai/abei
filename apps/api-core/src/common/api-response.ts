export interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export function successResponse<TData>(data: TData, message = "成功"): ApiResponse<TData> {
  return {
    code: 0,
    message,
    data
  };
}

export function failureResponse(code: number, message: string): ApiResponse<null> {
  return {
    code,
    message,
    data: null
  };
}
