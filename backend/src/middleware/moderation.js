import { moderateText, moderateImageUrl, moderateImageFile } from '../services/moderationService.js';
import { contentModerationError } from '../utils/errors.js';

/**
 * Evaluate user text and optional image before LLM / energy spend.
 * Throws CONTENT_MODERATION (422) when flagged.
 */
export async function requireContentModeration({ userId, text, imageUrl, imageFile, mimetype }) {
  if (text?.trim()) {
    const textResult = await moderateText(text, { userId });
    if (textResult.flagged) {
      throw contentModerationError(textResult.message, textResult.categories);
    }
  }

  if (imageUrl?.trim()) {
    const imageResult = await moderateImageUrl(imageUrl, { userId });
    if (imageResult.flagged) {
      throw contentModerationError(imageResult.message, imageResult.categories);
    }
  }

  if (imageFile) {
    const fileResult = await moderateImageFile(imageFile, { userId, mimetype });
    if (fileResult.flagged) {
      throw contentModerationError(fileResult.message, fileResult.categories);
    }
  }
}
