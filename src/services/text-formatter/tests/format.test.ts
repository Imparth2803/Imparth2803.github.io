import {toSentenceCase} from "../../../shared/text/letterCase";
import {
  FormatOptions,
  formatText,
  replaceAll,
  textStats,
  wrapExact,
  wrapWords
} from "../logic/format";

const off: FormatOptions = {
  removeNumbering: false,
  removeSpecial: false,
  removeNumbers: false,
  removePunctuation: false,
  find: "",
  replaceWith: "",
  matchCase: false,
  trimLines: false,
  collapseSpaces: false,
  letterCase: "keep",
  removeLineBreaks: false,
  lineOrder: "keep",
  wrapAt: null,
  wrapMode: "word",
  addNumbering: false,
  prefix: "",
  suffix: ""
};

describe("Text Formatter", () => {
  it("matches the requirements example", () => {
    const input = "   PARTH    TAWDE\n   rahul sharma\n   AMIT PATIL";
    expect(
      formatText(input, {
        ...off,
        letterCase: "title",
        trimLines: true,
        collapseSpaces: true
      })
    ).toBe("Parth Tawde\nRahul Sharma\nAmit Patil");
  });

  it("changes case in every supported way", () => {
    const text = "the rise OF nasa";
    expect(formatText(text, {...off, letterCase: "upper"})).toBe(
      "THE RISE OF NASA"
    );
    expect(formatText(text, {...off, letterCase: "lower"})).toBe(
      "the rise of nasa"
    );
    expect(
      formatText("the rise of the HR team", {...off, letterCase: "title"})
    ).toBe("The Rise of the HR Team");
    expect(
      formatText("the rise of the HR team", {...off, letterCase: "each-word"})
    ).toBe("The Rise Of The Hr Team");
  });

  it("writes sentence case by its rules", () => {
    expect(
      toSentenceCase("HELLO WORLD. this is NASA! is it? yes i think so")
    ).toBe("Hello world. This is NASA! Is it? Yes I think so");
    expect(toSentenceCase("hello. this is NASA calling")).toBe(
      "Hello. This is NASA calling"
    );
    expect(
      formatText("first line\nsecond line", {...off, letterCase: "sentence"})
    ).toBe("First line\nSecond line");
  });

  it("removes and adds numbering", () => {
    const input = "1. Apples\n2) Pears\n(3) Plums\n3.5 kg\n2024 report";
    expect(formatText(input, {...off, removeNumbering: true})).toBe(
      "Apples\nPears\nPlums\n3.5 kg\n2024 report"
    );
    expect(formatText("a\n\nb", {...off, addNumbering: true})).toBe(
      "1. a\n\n2. b"
    );
  });

  it("removes special characters, punctuation and numbers separately", () => {
    const text = "Hi! Cost: $25 + tax @ 5% 🙂";
    expect(formatText(text, {...off, removeSpecial: true})).toBe(
      "Hi! Cost: 25  tax  5 "
    );
    expect(formatText(text, {...off, removePunctuation: true})).toBe(
      "Hi Cost $25 + tax @ 5% 🙂"
    );
    expect(formatText(text, {...off, removeNumbers: true})).toBe(
      "Hi! Cost: $ + tax @ % 🙂"
    );
  });

  it("finds and replaces plain text, with or without matching case", () => {
    expect(replaceAll("Mr. A and mr. B", "mr.", "Dr.", false)).toBe(
      "Dr. A and Dr. B"
    );
    expect(replaceAll("Mr. A and mr. B", "mr.", "Dr.", true)).toBe(
      "Mr. A and Dr. B"
    );
    expect(replaceAll("a.*b", ".*", "-", true)).toBe("a-b"); // not a pattern
  });

  it("joins lines, sorts and reverses", () => {
    expect(formatText("b\n\na\nc", {...off, removeLineBreaks: true})).toBe(
      "b a c"
    );
    expect(formatText("b\nA\nc", {...off, lineOrder: "az"})).toBe("A\nb\nc");
    expect(formatText("b\nA\nc", {...off, lineOrder: "za"})).toBe("c\nb\nA");
    expect(formatText("1\n2\n3", {...off, lineOrder: "reverse"})).toBe(
      "3\n2\n1"
    );
  });

  it("adds text to the start and end of non-empty lines", () => {
    expect(formatText("a\n\nb", {...off, prefix: "- ", suffix: ";"})).toBe(
      "- a;\n\n- b;"
    );
  });

  it("breaks long lines at whole words or exactly", () => {
    expect(wrapWords("the quick brown fox", 10)).toEqual([
      "the quick",
      "brown fox"
    ]);
    expect(wrapWords("abcdefghijkl xy", 5)).toEqual([
      "abcde",
      "fghij",
      "kl xy"
    ]);
    expect(wrapExact("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(
      formatText("one two three", {...off, wrapAt: 7, wrapMode: "word"})
    ).toBe("one two\nthree");
  });

  it("counts words, characters and lines", () => {
    expect(textStats("Hello, world!\nIt's 2026.")).toEqual({
      words: 4,
      characters: 23,
      charactersNoSpaces: 21,
      lines: 2
    });
    expect(textStats("")).toEqual({
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      lines: 0
    });
  });
});
