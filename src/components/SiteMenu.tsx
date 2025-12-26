import { Link } from "react-router-dom";
import { LogIn, LogOut, Menu, Moon, Package, Palette, ShoppingBag, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

type SiteMenuProps = {
  showBrowse?: boolean;
};

export const SiteMenu = ({ showBrowse = true }: SiteMenuProps) => {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const nextTheme = theme === "dark" ? "light" : "dark";

  const handleThemeToggle = () => {
    setTheme(nextTheme);
  };

  const handleSignOut = () => {
    void signOut();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 px-3" aria-label="Open menu">
          <Menu className="h-4 w-4" />
          <span className="hidden sm:inline">Menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuItem asChild className="gap-2">
          <Link to="/orders">
            <Package className="h-4 w-4" />
            My Orders
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <Link to="/designs">
            <Palette className="h-4 w-4" />
            My Designs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {showBrowse ? (
          <>
            <DropdownMenuItem asChild className="gap-2">
              <Link to="/catalog">
                <ShoppingBag className="h-4 w-4" />
                Browse Cases
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={handleThemeToggle} className="gap-2">
          {nextTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          Switch to {nextTheme === "dark" ? "dark" : "light"} mode
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user ? (
          <DropdownMenuItem onSelect={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild className="gap-2">
            <Link to="/auth">
              <LogIn className="h-4 w-4" />
              Sign In
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
