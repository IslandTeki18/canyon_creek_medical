import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useUploadContentImage(forContent: "servicePage" | "blogPost") {
  const generateUrl = useMutation(
    api.domains.content.generateContentImageUploadUrl,
  );
  const confirm = useMutation(api.domains.content.confirmContentImage);

  return async (file: File) => {
    const uploadUrl = await generateUrl({ for: forContent });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Image upload failed");
    const { storageId } = (await response.json()) as {
      storageId: Id<"_storage">;
    };
    const result = await confirm({ storageId, for: forContent });
    if (!result.ok) throw new Error(result.error);
    return storageId;
  };
}
