import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './Card';
import { describe, it, expect, vi } from 'vitest';

describe('Card', () => {
  it('renders with default props', () => {
    render(<Card data-testid="card">Card content</Card>);
    const card = screen.getByTestId('card');

    expect(card).toBeInTheDocument();
    expect(card).toHaveClass(
      'rounded-xl',
      'border',
      'text-card-foreground',
      'transition-all',
      'border-gray-700',
      'bg-gray-800/50',
      'backdrop-blur-sm',
      'shadow-xl',
      'p-6'
    );
  });

  it('renders with different variants', () => {
    const { rerender } = render(<Card variant="entertainment" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('bg-gradient-to-br', 'from-gray-800/50');

    rerender(<Card variant="glass" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('bg-gray-800/30', 'backdrop-blur-md');

    rerender(<Card variant="solid" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('bg-gray-800');

    rerender(<Card variant="outline" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('bg-transparent', 'border-gray-600');
  });

  it('renders with different sizes', () => {
    const { rerender } = render(<Card size="sm" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('p-4');

    rerender(<Card size="lg" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('p-8');

    rerender(<Card size="xl" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('p-10');
  });

  it('renders with different hover effects', () => {
    const { rerender } = render(<Card hover="lift" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('hover:shadow-2xl', 'hover:-translate-y-1');

    rerender(<Card hover="glow" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('hover:shadow-red-500/20');

    rerender(<Card hover="scale" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('hover:scale-105');
  });

  it('applies custom className', () => {
    render(<Card className="custom-class" data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('custom-class');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Card ref={ref}>Content</Card>);
    
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  it('supports all HTML div attributes', () => {
    render(
      <Card
        data-testid="test-card"
        aria-label="Test card"
        role="region"
      >
        Content
      </Card>
    );
    
    const card = screen.getByTestId('test-card');
    expect(card).toHaveAttribute('aria-label', 'Test card');
    expect(card).toHaveAttribute('role', 'region');
  });
});

describe('CardHeader', () => {
  it('renders with default styles', () => {
    render(<CardHeader data-testid="header">Header content</CardHeader>);
    const header = screen.getByTestId('header');
    
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('flex', 'flex-col', 'space-y-1.5', 'pb-6');
  });

  it('applies custom className', () => {
    render(<CardHeader className="custom-header" data-testid="header">Content</CardHeader>);
    expect(screen.getByTestId('header')).toHaveClass('custom-header');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<CardHeader ref={ref}>Content</CardHeader>);
    
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });
});

describe('CardTitle', () => {
  it('renders as h3 with default styles', () => {
    render(<CardTitle>Test Title</CardTitle>);
    const title = screen.getByRole('heading', { level: 3 });
    
    expect(title).toBeInTheDocument();
    expect(title).toHaveClass('font-semibold', 'leading-none', 'tracking-tight', 'text-gray-100');
    expect(title).toHaveTextContent('Test Title');
  });

  it('applies custom className', () => {
    render(<CardTitle className="custom-title">Title</CardTitle>);
    expect(screen.getByRole('heading')).toHaveClass('custom-title');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<CardTitle ref={ref}>Title</CardTitle>);
    
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLHeadingElement));
  });
});

describe('CardDescription', () => {
  it('renders with default styles', () => {
    render(<CardDescription data-testid="description">Test description</CardDescription>);
    const description = screen.getByTestId('description');
    
    expect(description).toBeInTheDocument();
    expect(description).toHaveClass('text-sm', 'text-gray-400');
    expect(description).toHaveTextContent('Test description');
  });

  it('applies custom className', () => {
    render(<CardDescription className="custom-desc" data-testid="description">Desc</CardDescription>);
    expect(screen.getByTestId('description')).toHaveClass('custom-desc');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<CardDescription ref={ref}>Description</CardDescription>);
    
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLParagraphElement));
  });
});

describe('CardContent', () => {
  it('renders with default styles', () => {
    render(<CardContent data-testid="content">Card content</CardContent>);
    const content = screen.getByTestId('content');
    
    expect(content).toBeInTheDocument();
    expect(content).toHaveClass('pt-0');
  });

  it('applies custom className', () => {
    render(<CardContent className="custom-content" data-testid="content">Content</CardContent>);
    expect(screen.getByTestId('content')).toHaveClass('custom-content');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<CardContent ref={ref}>Content</CardContent>);
    
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });
});

describe('CardFooter', () => {
  it('renders with default styles', () => {
    render(<CardFooter data-testid="footer">Footer content</CardFooter>);
    const footer = screen.getByTestId('footer');
    
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveClass('flex', 'items-center', 'pt-6');
  });

  it('applies custom className', () => {
    render(<CardFooter className="custom-footer" data-testid="footer">Footer</CardFooter>);
    expect(screen.getByTestId('footer')).toHaveClass('custom-footer');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<CardFooter ref={ref}>Footer</CardFooter>);
    
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });
});

describe('Card Composition', () => {
  it('renders complete card structure correctly', () => {
    render(
      <Card data-testid="complete-card">
        <CardHeader>
          <CardTitle>Movie Title</CardTitle>
          <CardDescription>A great movie description</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Movie details and content</p>
        </CardContent>
        <CardFooter>
          <button>Watch Now</button>
        </CardFooter>
      </Card>
    );

    expect(screen.getByTestId('complete-card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Movie Title' })).toBeInTheDocument();
    expect(screen.getByText('A great movie description')).toBeInTheDocument();
    expect(screen.getByText('Movie details and content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watch Now' })).toBeInTheDocument();
  });
});