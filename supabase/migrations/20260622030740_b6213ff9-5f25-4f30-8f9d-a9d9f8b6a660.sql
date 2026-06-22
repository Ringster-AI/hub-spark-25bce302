DROP POLICY IF EXISTS blog_author_insert ON public.blog_posts;
DROP POLICY IF EXISTS blog_author_update ON public.blog_posts;
DROP POLICY IF EXISTS blog_author_delete ON public.blog_posts;
DROP POLICY IF EXISTS blog_author_read   ON public.blog_posts;

CREATE POLICY blog_admin_insert ON public.blog_posts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY blog_admin_update ON public.blog_posts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY blog_admin_delete ON public.blog_posts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY blog_admin_read ON public.blog_posts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
