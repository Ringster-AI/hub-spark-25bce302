import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { useState } from "react";

export const LandingNav = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed w-full top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex justify-between items-center">
          <Link to="/">
            <img
              src="/lovable-uploads/059d2b53-6e4e-4788-a607-2344b4097212.png"
              alt="Ringster Logo"
              className="h-10 sm:h-12 md:h-14 w-auto"
            />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">About</Link>
            <Link to="/how-it-works" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">How It Works</Link>
            <Link to="/pricing" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">Pricing</Link>
            <Link to="/blog" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">Blog</Link>
            <Link to="/contact" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">Contact</Link>
            <Button asChild variant="outline" size="sm"><Link to="/login">Login</Link></Button>
            <Button asChild size="sm"><Link to="/signup">Start Free Trial</Link></Button>
          </div>

          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={mobileMenuOpen}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pt-4 pb-2 border-t border-border mt-3">
            <div className="flex flex-col gap-3">
              <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors py-2">About</Link>
              <Link to="/how-it-works" className="text-muted-foreground hover:text-primary transition-colors py-2">How It Works</Link>
              <Link to="/pricing" className="text-muted-foreground hover:text-primary transition-colors py-2">Pricing</Link>
              <Link to="/blog" className="text-muted-foreground hover:text-primary transition-colors py-2">Blog</Link>
              <Link to="/contact" className="text-muted-foreground hover:text-primary transition-colors py-2">Contact</Link>
              <div className="flex gap-3 pt-2">
                <Button asChild variant="outline" size="sm" className="flex-1"><Link to="/login">Login</Link></Button>
                <Button asChild size="sm" className="flex-1"><Link to="/signup">Start Free Trial</Link></Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
