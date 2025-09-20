import { existsSync } from "fs";
import path from "path";

export interface ColorToken {
  name: string;
  value: string;
  usage: number;
  variants?: string[];
}

export interface SpacingToken {
  name: string;
  value: string;
  pixelValue: number;
  usage: number;
}

export interface TypographyToken {
  name: string;
  fontSize: string;
  lineHeight?: string;
  fontWeight?: string;
  fontFamily?: string;
  usage: number;
}

export interface TailwindTokens {
  colors: ColorToken[];
  spacing: SpacingToken[];
  typography: TypographyToken[];
  summary: {
    primaryColors: string[];
    secondaryColors: string[];
    spacingScale: string[];
    fontStacks: string[];
    capturedAt: string;
  };
}

/**
 * Infers Tailwind design tokens from captured styles
 */
export class StyleCompiler {
  private colorMap = new Map<string, number>();
  private spacingMap = new Map<string, number>();
  private typographyMap = new Map<string, number>();

  /**
   * Analyzes captured styles and generates Tailwind tokens
   */
  public inferTokens(sessionWorkspace: string): TailwindTokens {
    const stylesPath = path.join(sessionWorkspace, "styles.json");
    const responsivePath = path.join(sessionWorkspace, "responsive.json");
    
    let stylesData: any = null;
    let responsiveData: any = null;

    // Load captured style data
    if (existsSync(stylesPath)) {
      try {
        const content = require("fs").readFileSync(stylesPath, "utf8");
        stylesData = JSON.parse(content);
      } catch (error) {
        console.warn("Failed to parse styles.json:", error);
      }
    }

    if (existsSync(responsivePath)) {
      try {
        const content = require("fs").readFileSync(responsivePath, "utf8");
        responsiveData = JSON.parse(content);
      } catch (error) {
        console.warn("Failed to parse responsive.json:", error);
      }
    }

    // Reset maps for fresh analysis
    this.colorMap.clear();
    this.spacingMap.clear();
    this.typographyMap.clear();

    // Analyze styles data
    if (stylesData) {
      this.analyzeStylesData(stylesData);
    }

    // Analyze responsive data for additional context
    if (responsiveData) {
      this.analyzeResponsiveData(responsiveData);
    }

    return this.generateTokens();
  }

  private analyzeStylesData(stylesData: any) {
    // Process computed styles
    if (Array.isArray(stylesData)) {
      stylesData.forEach((styleEntry: any) => {
        if (styleEntry.styles) {
          this.processStyleObject(styleEntry.styles);
        }
      });
    }

    // If it's a single style object
    if (stylesData.styles) {
      this.processStyleObject(stylesData.styles);
    }
  }

  private analyzeResponsiveData(responsiveData: any) {
    if (responsiveData.breakpoints && Array.isArray(responsiveData.breakpoints)) {
      responsiveData.breakpoints.forEach((breakpoint: any) => {
        if (breakpoint.computedStyles && Array.isArray(breakpoint.computedStyles)) {
          breakpoint.computedStyles.forEach((styleEntry: any) => {
            if (styleEntry.styles) {
              this.processStyleObject(styleEntry.styles);
            }
          });
        }
      });
    }
  }

  private processStyleObject(styles: Record<string, string>) {
    // Extract colors
    this.extractColors(styles);
    
    // Extract spacing values
    this.extractSpacing(styles);
    
    // Extract typography
    this.extractTypography(styles);
  }

  private extractColors(styles: Record<string, string>) {
    const colorProperties = [
      'color', 'backgroundColor', 'borderColor', 'borderTopColor',
      'borderRightColor', 'borderBottomColor', 'borderLeftColor',
      'outlineColor', 'boxShadow', 'textShadow'
    ];

    colorProperties.forEach(prop => {
      const value = styles[prop];
      if (value && value !== 'none' && value !== 'transparent') {
        // Extract color values from various formats
        const colors = this.parseColorValue(value);
        colors.forEach(color => {
          const normalizedColor = this.normalizeColor(color);
          if (normalizedColor) {
            this.colorMap.set(normalizedColor, (this.colorMap.get(normalizedColor) || 0) + 1);
          }
        });
      }
    });
  }

  private extractSpacing(styles: Record<string, string>) {
    const spacingProperties = [
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'width', 'height', 'top', 'right', 'bottom', 'left',
      'gap', 'rowGap', 'columnGap', 'borderRadius'
    ];

    spacingProperties.forEach(prop => {
      const value = styles[prop];
      if (value && value !== 'auto' && value !== 'none') {
        const spacingValues = this.parseSpacingValue(value);
        spacingValues.forEach(spacing => {
          if (spacing.endsWith('px')) {
            this.spacingMap.set(spacing, (this.spacingMap.get(spacing) || 0) + 1);
          }
        });
      }
    });
  }

  private extractTypography(styles: Record<string, string>) {
    const fontSize = styles.fontSize;
    const lineHeight = styles.lineHeight;
    const fontWeight = styles.fontWeight;
    const fontFamily = styles.fontFamily;

    if (fontSize) {
      const typoKey = JSON.stringify({
        fontSize,
        lineHeight: lineHeight || 'normal',
        fontWeight: fontWeight || 'normal',
        fontFamily: this.normalizeFontFamily(fontFamily || 'inherit')
      });
      
      this.typographyMap.set(typoKey, (this.typographyMap.get(typoKey) || 0) + 1);
    }
  }

  private parseColorValue(value: string): string[] {
    const colors: string[] = [];
    
    // RGB/RGBA pattern
    const rgbPattern = /rgba?\([^)]+\)/g;
    let match;
    while ((match = rgbPattern.exec(value)) !== null) {
      colors.push(match[0]);
    }
    
    // HSL/HSLA pattern  
    const hslPattern = /hsla?\([^)]+\)/g;
    while ((match = hslPattern.exec(value)) !== null) {
      colors.push(match[0]);
    }
    
    // Hex colors
    const hexPattern = /#[0-9a-fA-F]{3,8}/g;
    while ((match = hexPattern.exec(value)) !== null) {
      colors.push(match[0]);
    }
    
    // Named colors (basic set)
    const namedColors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'gray', 'black', 'white'];
    namedColors.forEach(color => {
      if (value.includes(color)) {
        colors.push(color);
      }
    });
    
    return colors;
  }

  private parseSpacingValue(value: string): string[] {
    // Split compound values like "10px 20px" into individual values
    return value.split(/\s+/).filter(v => v && v !== '0');
  }

  private normalizeColor(color: string): string | null {
    // Convert various color formats to hex when possible
    color = color.trim().toLowerCase();
    
    if (color.startsWith('#')) {
      return color;
    }
    
    if (color.startsWith('rgb')) {
      return this.convertRgbToHex(color);
    }
    
    if (['transparent', 'inherit', 'initial', 'unset'].includes(color)) {
      return null;
    }
    
    return color;
  }

  private convertRgbToHex(rgb: string): string {
    const match = rgb.match(/rgba?\(([^)]+)\)/);
    if (!match) return rgb;
    
    const values = match[1].split(',').map(v => parseInt(v.trim()));
    if (values.length >= 3) {
      const hex = values.slice(0, 3)
        .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
        .join('');
      return `#${hex}`;
    }
    
    return rgb;
  }

  private normalizeFontFamily(fontFamily: string): string {
    // Simplify font family to main family name
    const families = fontFamily.split(',').map(f => f.trim().replace(/['"]/g, ''));
    return families[0] || 'inherit';
  }

  private generateTokens(): TailwindTokens {
    // Generate color tokens
    const colors = this.generateColorTokens();
    
    // Generate spacing tokens
    const spacing = this.generateSpacingTokens();
    
    // Generate typography tokens
    const typography = this.generateTypographyTokens();
    
    return {
      colors,
      spacing,
      typography,
      summary: {
        primaryColors: colors.slice(0, 5).map(c => c.value),
        secondaryColors: colors.slice(5, 10).map(c => c.value),
        spacingScale: spacing.slice(0, 10).map(s => s.value),
        fontStacks: [...new Set(typography.map(t => t.fontFamily).filter(Boolean))],
        capturedAt: new Date().toISOString()
      }
    };
  }

  private generateColorTokens(): ColorToken[] {
    const sortedColors = Array.from(this.colorMap.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20); // Top 20 most used colors

    return sortedColors.map(([color, usage], index) => ({
      name: this.generateColorName(color, index),
      value: color,
      usage,
      variants: this.generateColorVariants(color)
    }));
  }

  private generateSpacingTokens(): SpacingToken[] {
    const sortedSpacing = Array.from(this.spacingMap.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15); // Top 15 most used spacing values

    return sortedSpacing.map(([spacing, usage], index) => ({
      name: this.generateSpacingName(spacing, index),
      value: spacing,
      pixelValue: parseInt(spacing.replace('px', '')),
      usage
    }));
  }

  private generateTypographyTokens(): TypographyToken[] {
    const sortedTypo = Array.from(this.typographyMap.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10); // Top 10 most used typography combinations

    return sortedTypo.map(([typoJson, usage], index) => {
      const typo = JSON.parse(typoJson);
      return {
        name: this.generateTypographyName(typo, index),
        fontSize: typo.fontSize,
        lineHeight: typo.lineHeight !== 'normal' ? typo.lineHeight : undefined,
        fontWeight: typo.fontWeight !== 'normal' ? typo.fontWeight : undefined,
        fontFamily: typo.fontFamily !== 'inherit' ? typo.fontFamily : undefined,
        usage
      };
    });
  }

  private generateColorName(color: string, index: number): string {
    if (color.includes('black') || color === '#000000' || color === '#000') {
      return 'black';
    }
    if (color.includes('white') || color === '#ffffff' || color === '#fff') {
      return 'white';
    }
    if (color.includes('gray') || color.includes('grey')) {
      return `gray-${index + 1}`;
    }
    if (color.includes('blue')) {
      return `blue-${index + 1}`;
    }
    if (color.includes('red')) {
      return `red-${index + 1}`;
    }
    if (color.includes('green')) {
      return `green-${index + 1}`;
    }
    
    return `color-${index + 1}`;
  }

  private generateSpacingName(spacing: string, index: number): string {
    const px = parseInt(spacing.replace('px', ''));
    
    // Common Tailwind spacing scale
    const tailwindScale: Record<number, string> = {
      0: '0',
      1: '0.25',
      2: '0.5',
      3: '0.75',
      4: '1',
      5: '1.25',
      6: '1.5',
      8: '2',
      10: '2.5',
      12: '3',
      16: '4',
      20: '5',
      24: '6',
      32: '8',
      40: '10',
      48: '12',
      64: '16'
    };
    
    if (tailwindScale[px]) {
      return tailwindScale[px];
    }
    
    return `spacing-${index + 1}`;
  }

  private generateTypographyName(typo: any, index: number): string {
    const fontSize = parseInt(typo.fontSize.replace('px', ''));
    
    if (fontSize <= 12) return 'xs';
    if (fontSize <= 14) return 'sm';
    if (fontSize <= 16) return 'base';
    if (fontSize <= 18) return 'lg';
    if (fontSize <= 20) return 'xl';
    if (fontSize <= 24) return '2xl';
    if (fontSize <= 30) return '3xl';
    if (fontSize <= 36) return '4xl';
    if (fontSize <= 48) return '5xl';
    
    return `text-${index + 1}`;
  }

  private generateColorVariants(color: string): string[] {
    // Generate lighter/darker variants for the color
    // This is a simplified implementation
    const variants: string[] = [];
    
    if (color.startsWith('#') && color.length === 7) {
      // Generate variants by adjusting lightness
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      
      // Lighter variant
      const lighter = [
        Math.min(255, Math.round(r + (255 - r) * 0.3)),
        Math.min(255, Math.round(g + (255 - g) * 0.3)),
        Math.min(255, Math.round(b + (255 - b) * 0.3))
      ];
      variants.push(`#${lighter.map(v => v.toString(16).padStart(2, '0')).join('')}`);
      
      // Darker variant
      const darker = [
        Math.max(0, Math.round(r * 0.7)),
        Math.max(0, Math.round(g * 0.7)),
        Math.max(0, Math.round(b * 0.7))
      ];
      variants.push(`#${darker.map(v => v.toString(16).padStart(2, '0')).join('')}`);
    }
    
    return variants;
  }
}