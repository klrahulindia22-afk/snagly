import client from "./client";

export const getDigestPrefs = () =>
  client.get('/users/me/digest-prefs').then((r) => r.data);

export const updateDigestPrefs = (data) =>
  client.patch('/users/me/digest-prefs', data).then((r) => r.data);

export const triggerDigest = (data = {}) =>
  client.post('/digest/trigger', data).then((r) => r.data);
