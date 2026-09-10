/*
  # Add product_requests table and product-images storage bucket

  1. New Tables
    - `product_requests`
      - `id` (uuid, PK)
      - `user_id` (uuid, FK to auth.users)
      - `barcode` (text, nullable) - barcode if scanned
      - `notes` (text) - optional user notes about the product
      - `image_front` (text) - storage path to front photo
      - `image_back` (text) - storage path to back photo
      - `image_nutrition` (text) - storage path to nutrition facts photo
      - `status` (text) - 'pending' | 'processing' | 'completed' | 'failed'
      - `result_product_id` (uuid, FK to food_products) - filled when AI processing completes
      - `error_message` (text) - filled on failure
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled on `product_requests`
    - Users can only access their own requests
    - Storage bucket `product-images` created with RLS policies
*/

-- Product Requests table
CREATE TABLE IF NOT EXISTS product_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  barcode text DEFAULT '',
  notes text DEFAULT '',
  image_front text DEFAULT '',
  image_back text DEFAULT '',
  image_nutrition text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  result_product_id uuid REFERENCES food_products(id),
  error_message text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE product_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own product requests"
  ON product_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own product requests"
  ON product_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own product requests"
  ON product_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own product requests"
  ON product_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_product_requests_user_id ON product_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_product_requests_status ON product_requests(status);

-- Storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can upload to their own folder
CREATE POLICY "Users can upload product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own images
CREATE POLICY "Users can read own product images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can read all images (for edge function)
CREATE POLICY "Service role can read all product images"
  ON storage.objects FOR SELECT TO service_role
  USING (bucket_id = 'product-images');

-- Users can delete their own images
CREATE POLICY "Users can delete own product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
