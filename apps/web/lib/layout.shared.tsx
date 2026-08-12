import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Mail } from "lucide-react";
import { gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="brand-lockup">
          <span className="brand-icon">
            <Mail />
          </span>
          convex-invite
        </span>
      ),
    },
    links: [
      { text: "Documentation", url: "/docs", active: "nested-url" },
      {
        text: "Example",
        url: `https://github.com/${gitConfig.user}/${gitConfig.repo}/tree/main/apps/example`,
        external: true,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
