/** Braces read as message placeholders where names are shown, so no name may carry them. */
export const NAME_FORBIDDEN_CHARACTERS = /[{}]/

/** The name without the characters no name may have. */
export const withoutForbiddenNameCharacters = (name: string) =>
  name.replace(new RegExp(NAME_FORBIDDEN_CHARACTERS.source, "g"), "")
