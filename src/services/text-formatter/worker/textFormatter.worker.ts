import {textBlob} from "../../../shared/files/download";
import {readText, Source} from "../../../shared/tabular/source";
import {serve} from "../../../shared/worker/serve";
import {FormatOptions, formatText, textStats} from "../logic/format";

const PREVIEW_CHARS = 20000;

const handlers = {
  async run({
    source,
    options,
    maxLines
  }: {
    source: Source;
    options: FormatOptions;
    maxLines: number;
  }) {
    const input = await readText(source, maxLines);
    const output = formatText(input.text, options);
    return {
      notice: input.notice,
      before: textStats(input.text),
      after: textStats(output),
      preview: output.slice(0, PREVIEW_CHARS),
      length: output.length,
      text: textBlob(output)
    };
  }
};

export type TextFormatterApi = typeof handlers;

serve(handlers);
