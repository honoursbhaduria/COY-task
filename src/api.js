export async function api(path, body, file) {
  const response = await fetch(path, {
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
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}
