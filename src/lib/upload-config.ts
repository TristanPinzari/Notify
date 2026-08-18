// How long a presigned upload URL stays valid. Anything that reaps
// abandoned uploads must wait at least this long before acting, since S3
// itself won't reject a PUT against this URL until it expires — reaping
// sooner risks deleting a row for an upload that's still legitimately in
// flight (e.g. a large file on a slow connection).
export const UPLOAD_URL_EXPIRES_SEC = 60 * 60;
