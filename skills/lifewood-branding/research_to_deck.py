import sys
import json
import argparse
import os

sys.path.append(r"C:\Users\richa\.config\opencode\skills\lifewood-branding")

try:
    from lifewood_deck_builder import LifewoodDeck
except ImportError as e:
    print(f"Error importing LifewoodDeck: {e}")
    sys.exit(1)

try:
    from lifewood_pdf_builder import LifewoodPDF
except ImportError as e:
    LifewoodPDF = None

def generate_from_json(json_data, output_dir="."):
    title = json_data.get("title", "Research Overview")
    subtitle = json_data.get("subtitle", "AI Generated Brief")
    
    # Init Deck
    deck = LifewoodDeck(title=title, subtitle=subtitle, variant="editorial")
    deck.add_cover()
    
    # Init PDF if available
    pdf = LifewoodPDF(title=title, subtitle=subtitle) if LifewoodPDF else None
    if pdf:
        pdf.add_cover()

    slides = json_data.get("slides", [])
    
    # Auto-generate TOC
    toc_items = [f"{s.get('heading_num', str(i+1))} {s.get('heading_text', '')}" for i, s in enumerate(slides)]
    deck.add_toc(toc_items)
    if pdf:
        pdf.add_toc(toc_items)

    current_section = None

    for idx, slide in enumerate(slides):
        stype = slide.get("type", "content")
        num = slide.get("heading_num", str(idx+1) + ".0")
        text = slide.get("heading_text", "")
        
        # Check if we moved to a new top-level section
        top_level = num.split(".")[0]
        if top_level != current_section:
            deck.add_section(f"{top_level}.0", text)
            if pdf:
                pdf.add_section_divider(f"{top_level}.0", text)
            current_section = top_level

        if stype == "content":
            bullets = slide.get("bullets", [])
            deck.add_content(num, text, bullets)
            if pdf:
                pdf.add_content_page(num, text, bullets)
                
        elif stype == "two_column":
            lh = slide.get("left_heading", "")
            li = slide.get("left_items", [])
            rh = slide.get("right_heading", "")
            ri = slide.get("right_items", [])
            deck.add_two_column(num, text, lh, li, rh, ri)
            if pdf:
                pdf.add_two_column(num, text, lh, li, rh, ri)
                
        elif stype == "stats":
            stats_raw = slide.get("stats", [])
            # LifewoodDeck expects: [(number, label, description), ...]
            stats_tuples = [(s.get("number",""), s.get("label",""), s.get("desc","")) for s in stats_raw]
            # Some older LifewoodDeck versions might not support add_stats perfectly, but we try
            if hasattr(deck, 'add_stats'):
                deck.add_stats(num, text, stats_tuples)
            else:
                deck.add_content(num, text, [f"{s.get('number')} - {s.get('label')}: {s.get('desc')}" for s in stats_raw])
                
            if pdf:
                pdf.add_content_page(num, text, [f"{s.get('number')} - {s.get('label')}: {s.get('desc')}" for s in stats_raw])
                
        elif stype == "table":
            headers = slide.get("headers", [])
            rows = slide.get("rows", [])
            if hasattr(deck, 'add_table'):
                deck.add_table(num, text, headers, rows)
            else:
                deck.add_content(num, text, ["Table data provided"] + [str(r) for r in rows])
                
            if pdf:
                pdf.add_content_page(num, text, ["Table Data:"] + [", ".join(r) for r in rows])
        
        else:
            # Fallback
            deck.add_content(num, text, [str(slide.get("content", ""))])
            if pdf:
                pdf.add_content_page(num, text, [str(slide.get("content", ""))])

    # Save
    base_name = title.replace(" ", "_").replace("/", "_")
    ppt_path = os.path.join(output_dir, f"{base_name}.pptx")
    pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
    
    print(f"Saving PPTX to {ppt_path}")
    deck.save(ppt_path)
    
    if pdf:
        print(f"Saving PDF to {pdf_path}")
        pdf.save(pdf_path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Lifewood deck from JSON payload")
    parser.add_argument("json_file", help="Path to JSON payload")
    parser.add_argument("--outdir", default=".", help="Output directory")
    
    args = parser.parse_args()
    
    with open(args.json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    generate_from_json(data, args.outdir)
