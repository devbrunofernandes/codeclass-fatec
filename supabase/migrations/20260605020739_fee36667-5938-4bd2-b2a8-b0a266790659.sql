
-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_classroom_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_classroom_teacher(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_classroom_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_classroom_teacher(UUID, UUID) TO authenticated, service_role;

-- Storage policies: paths look like "<classroom_id>/<filename>"
CREATE POLICY "members read materials files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'materials'
  AND public.is_classroom_member((string_to_array(name, '/'))[1]::uuid, auth.uid())
);

CREATE POLICY "teachers upload materials files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'materials'
  AND public.is_classroom_teacher((string_to_array(name, '/'))[1]::uuid, auth.uid())
);

CREATE POLICY "teachers update materials files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'materials'
  AND public.is_classroom_teacher((string_to_array(name, '/'))[1]::uuid, auth.uid())
);

CREATE POLICY "teachers delete materials files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'materials'
  AND public.is_classroom_teacher((string_to_array(name, '/'))[1]::uuid, auth.uid())
);
