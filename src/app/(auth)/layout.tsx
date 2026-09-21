import Link from "next/link";
import { createElement as h, Fragment } from "react";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return h(
          Fragment,
          null,
          h(
                  "header",
            { className: "border-b border-line" },
                  h(
                            "div",
                    {
                                className:
                                              "wrap max-w-6xl mx-auto px-6 py-4 flex items-center justify-between",
                    },
                            h(
                                        Link,
                              {
                                            href: "/",
                                            className:
                                                            "flex items-center gap-2.5 font-serif font-semibold text-lg",
                              },
                                        h(
                                                      "span",
                                          {
                                                          className:
                                                                            "w-7 h-7 rounded-lg bg-accent text-accent-ink flex items-center justify-center font-mono text-xs",
                                          },
                                                      "Vf",
                                                    ),
                                        " ViaFactoring",
                                      ),
                            h(
                                        Link,
                              {
                                            href: "/",
                                            className: "text-sm font-medium text-ink-soft hover:text-ink",
                              },
                                        "Volver al inicio",
                                      ),
                          ),
                ),
          children,
        );
}
