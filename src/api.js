export async function api(path, body, file) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...(body !== undefined || file
        ? {
            method: "POST",
            headers: {
              "X-Coy-Request": "1",
              "Content-Type": file ? file.type : "application/json",
            },
            body: file || JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    throw Error(
      "Cannot reach Coy right now. Check your connection and try again.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error(
      "The server returned an unexpected response. Reload and try again.",
    );
  }
  if (!response.ok) throw Error(data.error || "Please try again.");
  return data;
}
