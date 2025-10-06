export interface FontOption {
  id: string;
  name: string;
  value: string;
  preview?: string;
}

export const fontPresets: FontOption[] = [
  {
    id: "system-ui",
    name: "System UI",
    value: "system-ui",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "system-sans",
    name: "System Sans",
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "system-serif",
    name: "System Serif",
    value: "ui-serif, Georgia, serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "system-mono",
    name: "System Mono",
    value: "ui-monospace, SFMono-Regular, 'SF Mono', monospace",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "arial",
    name: "Arial",
    value: "Arial, Helvetica, sans-serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "times-new-roman",
    name: "Times New Roman",
    value: "Times New Roman, Times, serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "playfair-display",
    name: "Playfair Display",
    value: "Playfair Display, Georgia, serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "crimson-text",
    name: "Crimson Text",
    value: "Crimson Text, Georgia, serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "cinzel",
    name: "Cinzel",
    value: "Cinzel, Times New Roman, serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "cinzel-decorative",
    name: "Cinzel Decorative",
    value: "Cinzel Decorative, Cinzel, serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "uncial-antiqua",
    name: "Uncial Antiqua",
    value: "Uncial Antiqua, fantasy",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "creepster",
    name: "Creepster",
    value: "Creepster, fantasy",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "nosifer",
    name: "Nosifer",
    value: "Nosifer, fantasy",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "metal-mania",
    name: "Metal Mania",
    value: "Metal Mania, fantasy",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "dancing-script",
    name: "Dancing Script",
    value: "Dancing Script, cursive",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "pacifico",
    name: "Pacifico",
    value: "Pacifico, cursive",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "indie-flower",
    name: "Indie Flower",
    value: "Indie Flower, cursive",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "kalam",
    name: "Kalam",
    value: "Kalam, cursive",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "caveat",
    name: "Caveat",
    value: "Caveat, cursive",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "atkinson-hyperlegible",
    name: "Atkinson Hyperlegible",
    value: "Atkinson Hyperlegible, Arial, sans-serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "lexend",
    name: "Lexend",
    value: "Lexend, Arial, sans-serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "opendyslexic",
    name: "OpenDyslexic",
    value: "OpenDyslexic, Arial, sans-serif",
    preview: "The quick brown fox jumps over the lazy dog",
  },
];
