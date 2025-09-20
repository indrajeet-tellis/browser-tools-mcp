import fs from "fs";
import path from "path";
import type { TailwindTokens } from "./style-compiler.js";
import type { ComponentMapping } from "./component-mapper.js";

export interface ProjectScaffoldConfig {
  projectName: string;
  outputPath: string;
  framework: "nextjs" | "vite-react";
  includeTypescript: boolean;
  includeTailwind: boolean;
  includeShadcn: boolean;
}

export interface ProjectGenerationResult {
  success: boolean;
  projectPath: string;
  generatedFiles: string[];
  errors: string[];
}

/**
 * Generates a complete Next.js + shadcn/ui project from captured data
 */
export class ProjectGenerator {
  
  public async generateProject(
    sessionWorkspacePath: string,
    config: ProjectScaffoldConfig
  ): Promise<ProjectGenerationResult> {
    const errors: string[] = [];
    const generatedFiles: string[] = [];

    try {
      // Create project directory
      const projectPath = path.join(config.outputPath, config.projectName);
      await fs.promises.mkdir(projectPath, { recursive: true });

      // Load captured data
      const tokens = await this.loadTokens(sessionWorkspacePath);
      const componentMapping = await this.loadComponentMapping(sessionWorkspacePath);
      const domSnapshot = await this.loadDomSnapshot(sessionWorkspacePath);

      // Generate package.json
      await this.generatePackageJson(projectPath, config, generatedFiles);

      // Generate Next.js config files
      if (config.framework === "nextjs") {
        await this.generateNextConfig(projectPath, generatedFiles);
        await this.generateAppLayout(projectPath, tokens, generatedFiles);
        await this.generateMainPage(projectPath, domSnapshot, componentMapping, generatedFiles);
      }

      // Generate Tailwind config with inferred tokens
      if (config.includeTailwind && tokens) {
        await this.generateTailwindConfig(projectPath, tokens, generatedFiles);
        await this.generateGlobalStyles(projectPath, generatedFiles);
      }

      // Generate component files
      if (componentMapping) {
        await this.generateComponents(projectPath, componentMapping, tokens, generatedFiles);
      }

      // Generate TypeScript config
      if (config.includeTypescript) {
        await this.generateTsConfig(projectPath, generatedFiles);
      }

      // Copy assets if available
      await this.copyAssets(sessionWorkspacePath, projectPath, generatedFiles);

      return {
        success: true,
        projectPath,
        generatedFiles,
        errors
      };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        projectPath: config.outputPath,
        generatedFiles,
        errors
      };
    }
  }

  private async loadTokens(workspacePath: string): Promise<TailwindTokens | null> {
    try {
      const tokensPath = path.join(workspacePath, "tailwind-tokens.json");
      if (fs.existsSync(tokensPath)) {
        const content = await fs.promises.readFile(tokensPath, "utf8");
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn("Failed to load tokens:", error);
    }
    return null;
  }

  private async loadComponentMapping(workspacePath: string): Promise<ComponentMapping | null> {
    try {
      const mappingPath = path.join(workspacePath, "component-mapping.json");
      if (fs.existsSync(mappingPath)) {
        const content = await fs.promises.readFile(mappingPath, "utf8");
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn("Failed to load component mapping:", error);
    }
    return null;
  }

  private async loadDomSnapshot(workspacePath: string): Promise<any | null> {
    try {
      const snapshotPath = path.join(workspacePath, "dom-snapshot.json");
      if (fs.existsSync(snapshotPath)) {
        const content = await fs.promises.readFile(snapshotPath, "utf8");
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn("Failed to load DOM snapshot:", error);
    }
    return null;
  }

  private async generatePackageJson(projectPath: string, config: ProjectScaffoldConfig, generatedFiles: string[]): Promise<void> {
    const packageJson = {
      name: config.projectName,
      version: "0.1.0",
      private: true,
      scripts: {
        dev: config.framework === "nextjs" ? "next dev" : "vite",
        build: config.framework === "nextjs" ? "next build" : "vite build",
        start: config.framework === "nextjs" ? "next start" : "vite preview",
        lint: "next lint"
      },
      dependencies: {
        ...(config.framework === "nextjs" ? {
          "next": "14.0.0",
          "react": "^18",
          "react-dom": "^18"
        } : {
          "react": "^18",
          "react-dom": "^18",
          "vite": "^5.0.0"
        }),
        ...(config.includeShadcn ? {
          "@radix-ui/react-accordion": "^1.1.2",
          "@radix-ui/react-alert-dialog": "^1.0.5",
          "@radix-ui/react-avatar": "^1.0.4",
          "@radix-ui/react-button": "^0.1.0",
          "@radix-ui/react-card": "^0.1.0",
          "@radix-ui/react-dialog": "^1.0.5",
          "@radix-ui/react-form": "^0.0.3",
          "@radix-ui/react-navigation-menu": "^1.1.4",
          "@radix-ui/react-select": "^2.0.0",
          "@radix-ui/react-sheet": "^0.1.0",
          "@radix-ui/react-table": "^0.1.0",
          "@radix-ui/react-tabs": "^1.0.4",
          "class-variance-authority": "^0.7.0",
          "clsx": "^2.0.0",
          "tailwind-merge": "^2.0.0"
        } : {}),
        ...(config.includeTailwind ? {
          "tailwindcss": "^3.3.0",
          "autoprefixer": "^10.0.1",
          "postcss": "^8"
        } : {})
      },
      devDependencies: {
        ...(config.includeTypescript ? {
          "typescript": "^5",
          "@types/node": "^20",
          "@types/react": "^18",
          "@types/react-dom": "^18"
        } : {}),
        "eslint": "^8",
        "eslint-config-next": "14.0.0"
      }
    };

    const filePath = path.join(projectPath, "package.json");
    await fs.promises.writeFile(filePath, JSON.stringify(packageJson, null, 2));
    generatedFiles.push(filePath);
  }

  private async generateNextConfig(projectPath: string, generatedFiles: string[]): Promise<void> {
    const config = `/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
`;

    const filePath = path.join(projectPath, "next.config.js");
    await fs.promises.writeFile(filePath, config);
    generatedFiles.push(filePath);
  }

  private async generateAppLayout(projectPath: string, tokens: TailwindTokens | null, generatedFiles: string[]): Promise<void> {
    const appDir = path.join(projectPath, "app");
    await fs.promises.mkdir(appDir, { recursive: true });

    const layout = `import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Cloned Website',
  description: 'Generated by BrowserTools MCP',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
`;

    const filePath = path.join(appDir, "layout.tsx");
    await fs.promises.writeFile(filePath, layout);
    generatedFiles.push(filePath);
  }

  private async generateMainPage(
    projectPath: string, 
    domSnapshot: any, 
    componentMapping: ComponentMapping | null, 
    generatedFiles: string[]
  ): Promise<void> {
    const appDir = path.join(projectPath, "app");
    
    // Generate basic page structure based on captured data
    let pageContent = `export default function Home() {
  return (
    <main className="min-h-screen p-8">`;

    if (componentMapping && componentMapping.components.length > 0) {
      // Add detected components
      const highConfidenceComponents = componentMapping.components
        .filter(c => c.confidence >= 0.6)
        .slice(0, 10); // Limit to prevent overwhelming output

      highConfidenceComponents.forEach(component => {
        const componentName = component.shadcnComponent.split(' ')[0]; // Get base component name
        pageContent += `
      <div className="mb-4">
        <${componentName}${this.generatePropsFromComponent(component)} />
      </div>`;
      });
    } else {
      // Fallback content
      pageContent += `
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Cloned Website</h1>
        <p className="text-lg text-gray-600">
          This page was automatically generated from a captured website.
          Component detection and styling will be improved in future versions.
        </p>
      </div>`;
    }

    pageContent += `
    </main>
  )
}
`;

    const filePath = path.join(appDir, "page.tsx");
    await fs.promises.writeFile(filePath, pageContent);
    generatedFiles.push(filePath);
  }

  private generatePropsFromComponent(component: any): string {
    // Generate basic props based on component type
    const baseComponent = component.shadcnComponent.split(' ')[0].toLowerCase();
    
    switch (baseComponent) {
      case 'button':
        return ` variant="default">Generated Button</Button`;
      case 'card':
        return `>
        <CardHeader>
          <CardTitle>Generated Card</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Card content from captured data</p>
        </CardContent>
      </Card`;
      default:
        return `>Generated ${baseComponent}</${baseComponent}`;
    }
  }

  private async generateTailwindConfig(projectPath: string, tokens: TailwindTokens, generatedFiles: string[]): Promise<void> {
    // Build custom color palette from tokens
    const colors: Record<string, any> = {};
    tokens.colors.forEach(colorToken => {
      colors[colorToken.name] = {
        DEFAULT: colorToken.value,
        ...(colorToken.variants ? {
          light: colorToken.variants[0],
          dark: colorToken.variants[1]
        } : {})
      };
    });

    // Build spacing scale from tokens
    const spacing: Record<string, string> = {};
    tokens.spacing.forEach(spacingToken => {
      spacing[spacingToken.name] = spacingToken.value;
    });

    const config = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 6)},
      spacing: ${JSON.stringify(spacing, null, 6)},
      fontFamily: {
        ${tokens.summary.fontStacks.map((font, index) => 
          `custom${index + 1}: ['${font}', 'sans-serif']`
        ).join(',\n        ')}
      },
    },
  },
  plugins: [],
}
`;

    const filePath = path.join(projectPath, "tailwind.config.js");
    await fs.promises.writeFile(filePath, config);
    generatedFiles.push(filePath);
  }

  private async generateGlobalStyles(projectPath: string, generatedFiles: string[]): Promise<void> {
    const appDir = path.join(projectPath, "app");
    
    const styles = `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Generated global styles from captured website */
:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}
`;

    const filePath = path.join(appDir, "globals.css");
    await fs.promises.writeFile(filePath, styles);
    generatedFiles.push(filePath);
  }

  private async generateComponents(
    projectPath: string, 
    componentMapping: ComponentMapping,
    tokens: TailwindTokens | null,
    generatedFiles: string[]
  ): Promise<void> {
    const componentsDir = path.join(projectPath, "components", "ui");
    await fs.promises.mkdir(componentsDir, { recursive: true });

    // Generate basic shadcn-style components
    const componentTypes = Object.keys(componentMapping.summary.componentTypes);
    
    for (const componentType of componentTypes) {
      await this.generateComponentFile(componentsDir, componentType, generatedFiles);
    }
  }

  private async generateComponentFile(componentsDir: string, componentType: string, generatedFiles: string[]): Promise<void> {
    const baseComponentName = componentType.split(' ')[0].toLowerCase();
    
    // Generate basic component template
    const componentCode = `import * as React from "react"
import { cn } from "@/lib/utils"

export interface ${baseComponentName.charAt(0).toUpperCase() + baseComponentName.slice(1)}Props
  extends React.HTMLAttributes<HTMLDivElement> {}

const ${baseComponentName.charAt(0).toUpperCase() + baseComponentName.slice(1)} = React.forwardRef<
  HTMLDivElement,
  ${baseComponentName.charAt(0).toUpperCase() + baseComponentName.slice(1)}Props
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "generated-${baseComponentName}",
      className
    )}
    {...props}
  />
))
${baseComponentName.charAt(0).toUpperCase() + baseComponentName.slice(1)}.displayName = "${baseComponentName.charAt(0).toUpperCase() + baseComponentName.slice(1)}"

export { ${baseComponentName.charAt(0).toUpperCase() + baseComponentName.slice(1)} }
`;

    const filePath = path.join(componentsDir, `${baseComponentName}.tsx`);
    await fs.promises.writeFile(filePath, componentCode);
    generatedFiles.push(filePath);
  }

  private async generateTsConfig(projectPath: string, generatedFiles: string[]): Promise<void> {
    const tsConfig = {
      compilerOptions: {
        target: "es5",
        lib: ["dom", "dom.iterable", "es6"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [
          {
            name: "next"
          }
        ],
        baseUrl: ".",
        paths: {
          "@/*": ["./*"]
        }
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"]
    };

    const filePath = path.join(projectPath, "tsconfig.json");
    await fs.promises.writeFile(filePath, JSON.stringify(tsConfig, null, 2));
    generatedFiles.push(filePath);
  }

  private async copyAssets(sessionWorkspacePath: string, projectPath: string, generatedFiles: string[]): Promise<void> {
    try {
      const assetsPath = path.join(sessionWorkspacePath, "assets.json");
      if (fs.existsSync(assetsPath)) {
        const assetsData = JSON.parse(await fs.promises.readFile(assetsPath, "utf8"));
        
        // Create public directory for assets
        const publicDir = path.join(projectPath, "public");
        await fs.promises.mkdir(publicDir, { recursive: true });
        
        // Note: In a real implementation, we would download and copy actual assets
        // For now, we'll create a manifest of what assets were detected
        const assetManifest = path.join(publicDir, "asset-manifest.json");
        await fs.promises.writeFile(assetManifest, JSON.stringify(assetsData, null, 2));
        generatedFiles.push(assetManifest);
      }
    } catch (error) {
      console.warn("Failed to copy assets:", error);
    }
  }
}