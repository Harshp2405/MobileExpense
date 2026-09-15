// // src/lib/storage/supabaseStorage.js
// import { createSupabaseAdmin } from "../../lib/backup/supabaseAdmin"; // or client
// import * as FileSystem from "expo-file-system/legacy";
// import { decode } from "base64-arraybuffer";

// export async function uploadReceiptToSupabase(localUri, userId) {
//   try {
//     const supabase = createSupabaseAdmin();
//     const base64 = await FileSystem.readAsStringAsync(localUri, {
//       encoding: FileSystem.EncodingType.Base64,
//     });

//     const filename = `${userId}/${Date.now()}.jpg`;
//     const { data, error } = await supabase.storage
//       .from("receipts")
//       .upload(filename, decode(base64), {
//         contentType: "image/jpeg",
//         upsert: false,
//       });

//     if (error) throw error;

//     const { data: publicUrlData } = supabase.storage
//       .from("receipts")
//       .getPublicUrl(data.path);

//     return publicUrlData.publicUrl;
//   } catch (error) {
//     console.error("Supabase image upload failed:", error);
//     return null;
//   }
// }
