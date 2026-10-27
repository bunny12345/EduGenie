import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// The AI tutor replies with OpenAI-style \( ... \) / \[ ... \] math
// delimiters, but remark-math only recognizes $...$ / $$...$$ — convert
// before handing the text to ReactMarkdown so fractions/equations render
// as real math instead of showing raw backslashes and braces. Only replaces
// BALANCED pairs (non-greedy) so a stray/unmatched delimiter (e.g. a reply
// cut off mid-expression) is left as literal text instead of producing an
// unterminated `$` that confuses remark-math.
function convertLatexDelimiters(text) {
  return String(text || '')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`);
}

// KaTeX throws on malformed LaTeX by default, which crashes the whole React
// tree mid-render (a message would render then the crash unmounts it) —
// render a red error span instead so one bad expression can't take down the
// chat. `strict: false` also silences warnings for things like plain-text
// unicode inside math mode, which the model outputs often.
const KATEX_OPTIONS = { throwOnError: false, strict: false };

// Belt-and-suspenders: if anything else in the markdown/KaTeX pipeline still
// throws, fall back to the raw text instead of losing the message entirely.
class MathMarkdownBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div className={this.props.className} style={{ whiteSpace: 'pre-wrap' }}>{this.props.fallbackText}</div>;
    }
    return this.props.children;
  }
}

export default function MathMarkdown({ text, className }) {
  const converted = useMemo(() => convertLatexDelimiters(text), [text]);
  return (
    <MathMarkdownBoundary className={className} fallbackText={text}>
      <div className={className}>
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}>
          {converted}
        </ReactMarkdown>
      </div>
    </MathMarkdownBoundary>
  );
}
