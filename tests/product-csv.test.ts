import { parseCsv, planImport, productsToCsv, readImportFile, updateBody } from '@/lib/store/product-csv'

const products = [
  {
    id: 1,
    name: 'Milo 400g',
    brand: 'Nestlé',
    category: 'Beverages',
    sku: 'MILO-400',
    description: 'Chocolate malt drink, "the energy food drink"',
    purchasePrice: 480,
    minQuantity: 5,
    imageUrl: '',
    units: [
      { unitName: 'Box', baseQuantity: 12, retailPrice: 540, barcodes: [{ code: '6001068321105' }] },
      { unitName: 'Tin', baseQuantity: 1, retailPrice: 48 },
    ],
  },
  { id: 2, name: 'Peak Milk, 160g', category: 'Dairy', purchasePrice: 300, imageUrl: 'https://old.example/peak.jpg', units: [] },
  { id: 3, name: 'Sugar', category: 'Groceries', purchasePrice: 100, units: [] },
  { id: 4, name: 'Sugar', category: 'Groceries', purchasePrice: 120, units: [] },
]

describe('export', () => {
  it('writes every product with escaped commas and quotes, and reads back the same', () => {
    const csv = productsToCsv(products)
    expect(csv.startsWith('﻿')).toBe(true)
    const table = parseCsv(csv)
    expect(table[0]).toEqual(['id', 'name', 'brand', 'category', 'sku', 'barcode', 'units', 'description', 'imageUrl'])
    expect(table[1]).toEqual([
      '1',
      'Milo 400g',
      'Nestlé',
      'Beverages',
      'MILO-400',
      '6001068321105',
      'Box (12) 540; Tin 48',
      'Chocolate malt drink, "the energy food drink"',
      '',
    ])
    expect(table[2][1]).toBe('Peak Milk, 160g')
    expect(table).toHaveLength(5)
  })
})

describe('reading an import file', () => {
  it('maps the headers an AI might use and keeps quoted newlines', () => {
    const csv = 'Product ID,Product Name,Image URL,Description\r\n1,Milo 400g,https://cdn.example/milo.png,"Line one\nline two"\r\n'
    const { rows, columns, error } = readImportFile(csv)
    expect(error).toBeUndefined()
    expect(columns).toEqual(['id', 'name', 'imageUrl', 'description'])
    expect(rows[0]).toEqual({
      line: 2,
      id: 1,
      name: 'Milo 400g',
      imageUrl: 'https://cdn.example/milo.png',
      description: 'Line one\nline two',
    })
  })
  it('reads semicolon files (Excel in some regions) and JSON', () => {
    expect(readImportFile('id;imageUrl\n2;https://x.example/a.webp').rows[0]).toMatchObject({ id: 2, imageUrl: 'https://x.example/a.webp' })
    expect(readImportFile('[{"id": 3, "image": "https://x.example/s.jpg"}]').rows[0]).toMatchObject({
      id: 3,
      imageUrl: 'https://x.example/s.jpg',
    })
  })
  it('explains files it can’t use', () => {
    expect(readImportFile('imageUrl\nhttps://x/a.jpg').error).toMatch(/id/)
    expect(readImportFile('id,imageUrl').error).toMatch(/no product rows/)
    expect(readImportFile('[1, 2').error).toMatch(/JSON/)
  })
})

describe('planning an import', () => {
  const plan = (csv: string, fields: ('imageUrl' | 'description' | 'brand')[] = ['imageUrl']) =>
    planImport(readImportFile(csv).rows, products, fields)

  it('matches by id, then SKU, then a unique name', () => {
    const p = plan(
      'id,sku,name,imageUrl\n1,,,https://a.example/1.jpg\n,,"Peak Milk, 160g",https://a.example/2.jpg\n,milo-400,,https://a.example/x.jpg'
    )
    expect(p.map((x) => [x.product?.id, x.matchedBy, x.problem])).toEqual([
      [1, 'id', undefined],
      [2, 'name', undefined],
      [1, 'sku', 'This product is already in the file'],
    ])
    expect(p[1].changes.imageUrl).toEqual({ from: 'https://old.example/peak.jpg', to: 'https://a.example/2.jpg' })
  })

  it('never clears with a blank cell, refuses non-links and ambiguous names', () => {
    const p = plan('id,name,imageUrl\n2,,\n1,,not a link\n,Sugar,https://a.example/s.jpg\n99,,https://a.example/z.jpg')
    expect(p.map((x) => x.problem)).toEqual([
      'Nothing to change',
      'The image link isn’t a web address',
      '2 products are called “Sugar” — keep the id column',
      'No matching product',
    ])
  })

  it('changes descriptions and brands only when asked', () => {
    const csv = 'id,brand,description,imageUrl\n2,Peak,Evaporated milk,'
    expect(plan(csv)[0].problem).toBe('Nothing to change')
    expect(plan(csv, ['imageUrl', 'brand', 'description'])[0].changes).toEqual({
      brand: { from: '', to: 'Peak' },
      description: { from: '', to: 'Evaporated milk' },
    })
  })
})

describe('update body', () => {
  it('resends the required fields as they are and adds only what changed', () => {
    expect(updateBody(products[0], { imageUrl: { from: '', to: 'https://a.example/1.jpg' } })).toEqual({
      name: 'Milo 400g',
      description: 'Chocolate malt drink, "the energy food drink"',
      category: 'Beverages',
      purchasePrice: 480,
      minQuantity: 5,
      imageUrl: 'https://a.example/1.jpg',
    })
  })
})
