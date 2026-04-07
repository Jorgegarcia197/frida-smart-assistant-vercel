import Link from 'next/link';
import React, { type ComponentPropsWithoutRef, memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

const components: Partial<Components> = {
  // @ts-expect-error
  code: CodeBlock,
  pre: ({ children }) => <>{children}</>,
  p: ({ node, children, ...props }) => {
    // Check if the paragraph contains a code element
    const hasCodeBlock = React.Children.toArray(children).some((child) => {
      return React.isValidElement(child) && child.type === CodeBlock;
    });
    
    if (hasCodeBlock) {
      // If it contains a code block, don't wrap it in a paragraph
      return <>{children}</>;
    }
    
    // Otherwise, render as normal paragraph
    return (
      <p {...(props as ComponentPropsWithoutRef<'p'>)}>{children}</p>
    );
  },
  ol: ({ node, children, ...props }) => {
    return (
      <ol
        className="list-decimal list-outside ml-4"
        {...(props as ComponentPropsWithoutRef<'ol'>)}
      >
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-1" {...(props as ComponentPropsWithoutRef<'li'>)}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul
        className="list-decimal list-outside ml-4"
        {...(props as ComponentPropsWithoutRef<'ul'>)}
      >
        {children}
      </ul>
    );
  },
  strong: ({ node, children, ...props }) => {
    return (
      <span className="font-semibold" {...(props as ComponentPropsWithoutRef<'span'>)}>
        {children}
      </span>
    );
  },
  a: ({ node, children, ...props }) => {
    return (
      // @ts-expect-error
      <Link
        className="text-blue-500 hover:underline"
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1
        className="text-3xl font-semibold mt-6 mb-2"
        {...(props as ComponentPropsWithoutRef<'h1'>)}
      >
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2
        className="text-2xl font-semibold mt-6 mb-2"
        {...(props as ComponentPropsWithoutRef<'h2'>)}
      >
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3
        className="text-xl font-semibold mt-6 mb-2"
        {...(props as ComponentPropsWithoutRef<'h3'>)}
      >
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4
        className="text-lg font-semibold mt-6 mb-2"
        {...(props as ComponentPropsWithoutRef<'h4'>)}
      >
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5
        className="text-base font-semibold mt-6 mb-2"
        {...(props as ComponentPropsWithoutRef<'h5'>)}
      >
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6
        className="text-sm font-semibold mt-6 mb-2"
        {...(props as ComponentPropsWithoutRef<'h6'>)}
      >
        {children}
      </h6>
    );
  },
};

const remarkPlugins = [remarkGfm];

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {children}
    </ReactMarkdown>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
