-- Migration: Catalog Libraries, Folders & Assemblies
-- Run this in Supabase SQL Editor

-- =============================================
-- LIBRARIES — top-level containers
-- =============================================
CREATE TABLE IF NOT EXISTS libraries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LIBRARY FOLDERS — nested folders within a library
-- =============================================
CREATE TABLE IF NOT EXISTS library_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES library_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ASSEMBLIES — named groups of items priced together
-- =============================================
CREATE TABLE IF NOT EXISTS assemblies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ASSEMBLY ITEMS — junction: assembly + catalog item + qty
-- =============================================
CREATE TABLE IF NOT EXISTS assembly_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES items_catalog(id) ON DELETE CASCADE,
  quantity DECIMAL(10,2) DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(assembly_id, catalog_item_id)
);

-- =============================================
-- NEW COLUMNS ON items_catalog
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items_catalog' AND column_name = 'library_id') THEN
    ALTER TABLE items_catalog ADD COLUMN library_id UUID REFERENCES libraries(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items_catalog' AND column_name = 'folder_id') THEN
    ALTER TABLE items_catalog ADD COLUMN folder_id UUID REFERENCES library_folders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items_catalog' AND column_name = 'item_number') THEN
    ALTER TABLE items_catalog ADD COLUMN item_number VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items_catalog' AND column_name = 'notes') THEN
    ALTER TABLE items_catalog ADD COLUMN notes TEXT;
  END IF;
END $$;

-- =============================================
-- AUTO-MIGRATION: create default library & convert categories to folders
-- =============================================
DO $$
DECLARE
  default_lib_id UUID;
  cat_name TEXT;
  new_folder_id UUID;
BEGIN
  -- Create default library if none exists
  IF NOT EXISTS (SELECT 1 FROM libraries WHERE is_default = true) THEN
    INSERT INTO libraries (name, is_default, sort_order)
    VALUES ('Custom Library', true, 0)
    RETURNING id INTO default_lib_id;
  ELSE
    SELECT id INTO default_lib_id FROM libraries WHERE is_default = true LIMIT 1;
  END IF;

  -- Convert each distinct category into a folder under the default library
  FOR cat_name IN
    SELECT DISTINCT category FROM items_catalog WHERE category IS NOT NULL AND category != ''
  LOOP
    -- Only create folder if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM library_folders WHERE library_id = default_lib_id AND name = cat_name AND parent_id IS NULL
    ) THEN
      INSERT INTO library_folders (library_id, name, sort_order)
      VALUES (default_lib_id, cat_name, 0)
      RETURNING id INTO new_folder_id;

      -- Assign items with this category to the new folder
      UPDATE items_catalog
      SET library_id = default_lib_id, folder_id = new_folder_id
      WHERE category = cat_name AND (library_id IS NULL);
    END IF;
  END LOOP;

  -- Assign any remaining items (no category) to the default library without a folder
  UPDATE items_catalog
  SET library_id = default_lib_id
  WHERE library_id IS NULL;
END $$;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_library_folders_library ON library_folders(library_id);
CREATE INDEX IF NOT EXISTS idx_library_folders_parent ON library_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_assemblies_library ON assemblies(library_id);
CREATE INDEX IF NOT EXISTS idx_assembly_items_assembly ON assembly_items(assembly_id);
CREATE INDEX IF NOT EXISTS idx_assembly_items_catalog ON assembly_items(catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_items_catalog_library ON items_catalog(library_id);
CREATE INDEX IF NOT EXISTS idx_items_catalog_folder ON items_catalog(folder_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Allow public read libraries" ON libraries;
DROP POLICY IF EXISTS "Allow authenticated insert libraries" ON libraries;
DROP POLICY IF EXISTS "Allow authenticated update libraries" ON libraries;
DROP POLICY IF EXISTS "Allow authenticated delete libraries" ON libraries;

DROP POLICY IF EXISTS "Allow public read library_folders" ON library_folders;
DROP POLICY IF EXISTS "Allow authenticated insert library_folders" ON library_folders;
DROP POLICY IF EXISTS "Allow authenticated update library_folders" ON library_folders;
DROP POLICY IF EXISTS "Allow authenticated delete library_folders" ON library_folders;

DROP POLICY IF EXISTS "Allow public read assemblies" ON assemblies;
DROP POLICY IF EXISTS "Allow authenticated insert assemblies" ON assemblies;
DROP POLICY IF EXISTS "Allow authenticated update assemblies" ON assemblies;
DROP POLICY IF EXISTS "Allow authenticated delete assemblies" ON assemblies;

DROP POLICY IF EXISTS "Allow public read assembly_items" ON assembly_items;
DROP POLICY IF EXISTS "Allow authenticated insert assembly_items" ON assembly_items;
DROP POLICY IF EXISTS "Allow authenticated update assembly_items" ON assembly_items;
DROP POLICY IF EXISTS "Allow authenticated delete assembly_items" ON assembly_items;

-- Libraries
CREATE POLICY "Allow public read libraries" ON libraries FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert libraries" ON libraries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update libraries" ON libraries FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete libraries" ON libraries FOR DELETE USING (true);

-- Library Folders
CREATE POLICY "Allow public read library_folders" ON library_folders FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert library_folders" ON library_folders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update library_folders" ON library_folders FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete library_folders" ON library_folders FOR DELETE USING (true);

-- Assemblies
CREATE POLICY "Allow public read assemblies" ON assemblies FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert assemblies" ON assemblies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update assemblies" ON assemblies FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete assemblies" ON assemblies FOR DELETE USING (true);

-- Assembly Items
CREATE POLICY "Allow public read assembly_items" ON assembly_items FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert assembly_items" ON assembly_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update assembly_items" ON assembly_items FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete assembly_items" ON assembly_items FOR DELETE USING (true);
