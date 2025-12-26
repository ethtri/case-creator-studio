import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { phoneVariants, getPhoneModels, getBrands } from "@/data/phoneVariants";
import { Filter, Search } from "lucide-react";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";

const Catalog = () => {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const brands = getBrands();
  const phoneModels = getPhoneModels();

  const filteredModels = useMemo(() => {
    const entries = Array.from(phoneModels.entries());
    let filtered = entries;
    
    if (selectedBrand) {
      filtered = filtered.filter(([key]) => key.startsWith(selectedBrand));
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered
        .map(([key, variants]) => [key, variants.filter(v => 
          v.model.toLowerCase().includes(query) || 
          v.brand.toLowerCase().includes(query)
        )] as [string, typeof variants])
        .filter(([, variants]) => variants.length > 0);
    }
    
    return filtered;
  }, [phoneModels, selectedBrand, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu showBrowse={false} />
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-28 pb-12">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Choose Your Phone
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl">
              Select your phone model to start designing your custom case
            </p>
          </motion.div>

          {/* Search & Brand Filter */}
          <motion.div
            className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search phones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Button
                variant={selectedBrand === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedBrand(null)}
              >
                All
              </Button>
              {brands.map((brand) => (
                <Button
                  key={brand}
                  variant={selectedBrand === brand ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedBrand(brand)}
                >
                  {brand}
                </Button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Phone Models Grid */}
      <section className="pb-24">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredModels.flatMap(([, variants]) => variants).map((variant, index) => (
              <motion.div
                key={variant.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
              >
                <Link to={`/design/${variant.id}`}>
                  <div className="group relative bg-card rounded-xl p-4 hover:shadow-medium transition-all duration-200 cursor-pointer border border-border/50 hover:border-accent/50">
                    {/* Phone Icon */}
                    <div className="flex justify-center mb-3">
                      <div className="w-10 h-20 rounded-lg bg-muted border-2 border-border/50 flex flex-col items-center pt-1">
                        <div className="w-4 h-1 rounded-full bg-foreground/20" />
                      </div>
                    </div>

                    {/* Model name & Price */}
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">{variant.brand}</p>
                      <p className="text-sm font-medium leading-tight mb-2">{variant.model}</p>
                      <p className="text-sm font-semibold text-accent">${variant.price.toFixed(2)}</p>
                    </div>

                    {/* Hover ring */}
                    <div className="absolute inset-0 rounded-xl ring-2 ring-accent ring-opacity-0 group-hover:ring-opacity-100 transition-all pointer-events-none" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 snapcase.ai. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Catalog;
