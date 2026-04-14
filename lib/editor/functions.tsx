'use client';

import { MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { DOMParser, type Node } from 'prosemirror-model';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { renderToString } from 'react-dom/server';

import { Response } from '@/components/elements/response';

import { documentSchema } from './config';
import { createSuggestionWidget, type UISuggestion } from './suggestions';

const escapeTableCell = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', '<br />');

const getCellText = (cellNode: Node) => {
  return escapeTableCell(cellNode.textBetween(0, cellNode.content.size, ' ')).trim();
};

const markdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    table(state, node) {
      const rows: string[][] = [];

      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => {
          cells.push(getCellText(cell));
        });
        rows.push(cells);
      });

      if (rows.length === 0) {
        return;
      }

      const columnCount = rows.reduce(
        (maxColumns, row) => Math.max(maxColumns, row.length),
        0,
      );

      const normalizedRows = rows.map((row) => {
        if (row.length >= columnCount) return row;
        return [...row, ...Array.from({ length: columnCount - row.length }, () => '')];
      });

      const headerRow = normalizedRows[0];
      const separatorRow = Array.from({ length: columnCount }, () => '---');

      state.ensureNewLine();
      state.write(`| ${headerRow.join(' | ')} |`);
      state.write('\n');
      state.write(`| ${separatorRow.join(' | ')} |`);

      for (let index = 1; index < normalizedRows.length; index++) {
        state.write('\n');
        state.write(`| ${normalizedRows[index].join(' | ')} |`);
      }

      state.closeBlock(node);
    },
  },
  defaultMarkdownSerializer.marks,
);

export const buildDocumentFromContent = (content: string) => {
  const parser = DOMParser.fromSchema(documentSchema);
  const stringFromMarkdown = renderToString(<Response>{content}</Response>);
  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = stringFromMarkdown;
  return parser.parse(tempContainer);
};

export const buildContentFromDocument = (document: Node) => {
  return markdownSerializer.serialize(document);
};

export const createDecorations = (
  suggestions: Array<UISuggestion>,
  view: EditorView,
) => {
  const decorations: Array<Decoration> = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: 'suggestion-highlight',
        },
        {
          suggestionId: suggestion.id,
          type: 'highlight',
        },
      ),
    );

    decorations.push(
      Decoration.widget(
        suggestion.selectionStart,
        (view) => {
          const { dom } = createSuggestionWidget(suggestion, view);
          return dom;
        },
        {
          suggestionId: suggestion.id,
          type: 'widget',
        },
      ),
    );
  }

  return DecorationSet.create(view.state.doc, decorations);
};
