
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BlogPost } from "@/types/blog";
import BlogPostGrid from "@/components/blog/BlogPostGrid";
import BlogPostsLoading from "@/components/blog/BlogPostsLoading";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 12;

const Blog = () => {
  const [page, setPage] = useState(0);

  const { data: posts, isLoading, isFetching } = useQuery({
    queryKey: ['blog-posts', page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('blog_posts')
        // Only the fields used by the list card. Detail page fetches full content.
        .select('id,title,slug,featured_image,excerpt,published_at,created_at,updated_at,author_id,status')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data || []) as unknown as BlogPost[];
    },
  });

  const pageFull = (posts?.length ?? 0) === PAGE_SIZE;

  return (
    <main className="min-h-screen bg-white">
      <Seo title="Ringster Blog — AI Phone Agents Insights" description="Articles on AI phone agents, call automation, and lead capture strategies." />
      <div className="container mx-auto px-6 py-32">
        <h1 className="text-4xl font-bold text-[#1A1F2C] mb-12">Ringster Blog — AI Phone Agent & Automation Insights</h1>

        {isLoading ? <BlogPostsLoading /> : <BlogPostGrid posts={posts || []} />}

        <div className="flex items-center justify-between mt-12">
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={!pageFull || isFetching}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Blog;
