import client from "./client";

export const getMe = () => client.get("/users/me").then((r) => r.data);

export const updateProfile = (data) =>
  client.patch("/users/me", data).then((r) => r.data);

export const changePassword = (data) =>
  client.post("/users/me/change-password", data).then((r) => r.data);

export const uploadAvatar = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return client.post("/users/me/avatar", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then((r) => r.data);
};

export const deleteAccount = () =>
  client.delete("/users/me").then((r) => r.data);
