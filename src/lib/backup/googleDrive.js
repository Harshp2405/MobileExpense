// src/lib/backup/googleDrive.js

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export async function uploadBackupToDrive(token, jsonString, fileName) {
  const boundary = "expense_backup_boundary";
  const metadata = {
    name: fileName,
    mimeType: "application/json",
    parents: ["appDataFolder"],
  };

  const body =
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    jsonString +
    `\r\n--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Drive upload failed: ${JSON.stringify(err)}`);
  }
  return await res.json();
}

export async function listBackupsFromDrive(token) {
  const q = `'appDataFolder' in parents and trashed=false`;
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&orderBy=createdTime desc&fields=files(id,name,createdTime,size)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.files || [];
}

export async function downloadBackupFromDrive(token, fileId) {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Download failed");
  return await res.text();
}

export async function pruneOldBackups(token, keepCount = 10) {
  const files = await listBackupsFromDrive(token);
  if (files.length <= keepCount) return;
  for (const file of files.slice(keepCount)) {
    await fetch(`${DRIVE_FILES_URL}/${file.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
