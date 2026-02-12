import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { CopyHeadingLinkClient } from "@/components/help/CopyHeadingLinkClient";

function isExternalHref(href: string): boolean {
  if (href.startsWith("#")) return false;
  if (href.startsWith("/")) return false;
  if (href.startsWith("mailto:")) return true;
  if (href.startsWith("tel:")) return true;
  return /^https?:\/\//i.test(href);
}

export function Markdown({ markdown }: { markdown: string }) {
  return (
    <div className="max-w-none text-gray-100 leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          h1: ({ node: _node, children, ...props }) => {
            const id = typeof props.id === "string" ? props.id : undefined;
            return (
              <div className="group flex items-center mb-4">
                <h1
                  className="scroll-mt-24 text-3xl font-semibold tracking-tight text-white"
                  {...props}
                >
                  {id ? (
                    <a
                      href={`#${id}`}
                      className="text-inherit no-underline hover:underline underline-offset-4"
                    >
                      {children}
                    </a>
                  ) : (
                    children
                  )}
                </h1>
                {id && (
                  <CopyHeadingLinkClient
                    id={id}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity self-center"
                  />
                )}
              </div>
            );
          },
          h2: ({ node: _node, children, ...props }) => {
            const id = typeof props.id === "string" ? props.id : undefined;
            return (
              <div className="group flex items-center mt-10 mb-3">
                <h2
                  className="scroll-mt-24 text-2xl font-semibold tracking-tight text-white"
                  {...props}
                >
                  {id ? (
                    <a
                      href={`#${id}`}
                      className="text-inherit no-underline hover:underline underline-offset-4"
                    >
                      {children}
                    </a>
                  ) : (
                    children
                  )}
                </h2>
                {id && (
                  <CopyHeadingLinkClient
                    id={id}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity self-center"
                  />
                )}
              </div>
            );
          },
          h3: ({ node: _node, children, ...props }) => {
            const id = typeof props.id === "string" ? props.id : undefined;
            return (
              <div className="group flex items-center mt-8 mb-2">
                <h3
                  className="scroll-mt-24 text-xl font-semibold tracking-tight text-white"
                  {...props}
                >
                  {id ? (
                    <a
                      href={`#${id}`}
                      className="text-inherit no-underline hover:underline underline-offset-4"
                    >
                      {children}
                    </a>
                  ) : (
                    children
                  )}
                </h3>
                {id && (
                  <CopyHeadingLinkClient
                    id={id}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity self-center"
                  />
                )}
              </div>
            );
          },
          p: ({ node: _node, ...props }) => (
            <p className="text-gray-200 mb-4" {...props} />
          ),
          a: ({ node: _node, href, ...props }) => {
            const url = typeof href === "string" ? href : "";
            const external = url ? isExternalHref(url) : false;

            return (
              <a
                className="text-red-400 hover:underline underline-offset-4"
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                {...props}
              />
            );
          },
          ul: ({ node: _node, ...props }) => (
            <ul className="list-disc pl-6 mb-4" {...props} />
          ),
          ol: ({ node: _node, ...props }) => (
            <ol className="list-decimal pl-6 mb-4" {...props} />
          ),
          li: ({ node: _node, ...props }) => <li className="mb-1" {...props} />,
          blockquote: ({ node: _node, ...props }) => (
            <blockquote
              className="border-l-2 border-gray-800 pl-4 text-gray-300 my-4"
              {...props}
            />
          ),
          hr: ({ node: _node, ...props }) => (
            <hr className="border-gray-800 my-8" {...props} />
          ),
          code: ({ node: _node, className, children, ...props }) => {
            const isBlock =
              typeof className === "string" && className.includes("language-");
            if (isBlock)
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            return (
              <code
                className="rounded bg-gray-900/60 px-1.5 py-0.5 text-red-300"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ node: _node, ...props }) => (
            <pre
              className="my-4 overflow-x-auto rounded border border-gray-800 bg-gray-900/50 p-4"
              {...props}
            />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table {...props} />
            </div>
          ),
          th: ({ node: _node, ...props }) => (
            <th
              className="border border-gray-800 bg-gray-900/50 px-3 py-2 text-left"
              {...props}
            />
          ),
          td: ({ node: _node, ...props }) => (
            <td
              className="border border-gray-800 px-3 py-2 align-top"
              {...props}
            />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
