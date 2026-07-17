const EDITOR_FONT_STYLESHEET_ID = "snapcase-editor-fonts";
const EDITOR_FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Dancing+Script:wght@700&family=Lobster&family=Oswald:wght@700&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:wght@700&family=Raleway:wght@700&family=Roboto:wght@700&family=Sacramento&display=swap";

export const loadEditorFonts = () => {
  if (
    typeof document === "undefined" ||
    document.getElementById(EDITOR_FONT_STYLESHEET_ID)
  ) {
    return;
  }

  const stylesheet = document.createElement("link");
  stylesheet.id = EDITOR_FONT_STYLESHEET_ID;
  stylesheet.rel = "stylesheet";
  stylesheet.href = EDITOR_FONT_STYLESHEET;
  document.head.append(stylesheet);
};
