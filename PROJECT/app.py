from flask import Flask, jsonify, render_template, send_file, request
import pandas as pd
import io
from flask_cors import CORS
import re


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

df = pd.read_csv("gamesales.csv")
def apply_filters_with_body(df, filters):
    if "year" in filters and filters["year"]:
        df = df[df["Year"].isin([int(y) for y in filters["year"]])]
    if "genre" in filters and filters["genre"]:
        df = df[df["Genre"].str.lower().isin([g.lower() for g in filters["genre"]])]
    if "platform" in filters and filters["platform"]:
        df = df[df["Platform"].str.lower().isin([p.lower() for p in filters["platform"]])]
    if "publisher" in filters and filters["publisher"]:
        df = df[df["Publisher"].str.lower().isin([p.lower() for p in filters["publisher"]])]
    if "game" in filters and filters["game"]:
        df = df[df["Name"].str.contains(filters["game"], case=False, na=False)]
    return df
print("apply_filters argcount =", apply_filters_with_body.__code__.co_argcount)

@app.route("/")
def index():
    return render_template("index.html")

# Filter Config
REGION_MAP = {
    "bắc mỹ": "NA",
    "bắc mĩ": "NA",
    "north america": "NA",
    "na": "NA",

    "châu âu": "EU",
    "âu": "EU",
    "eu": "EU",

    "nhật": "JP",
    "nhật bản": "JP",
    "japan": "JP",
    "jp": "JP",

    "khác": "Other",
    "other": "Other"
}
GENRES = df["Genre"].dropna().unique().tolist()
PLATFORMS = df["Platform"].dropna().unique().tolist()
PUBLISHERS = df["Publisher"].dropna().unique().tolist()
def parse_query(text: str):
    text = text.lower()

    filters = {
        "year": [],
        "genre": [],
        "platform": [],
        "publisher": [],
        "region": [],
        "name": ""
    }

    for k, v in REGION_MAP.items():
        if k in text and v not in filters["region"]:
            filters["region"].append(v)

    years = re.findall(r"(19\d{2}|20\d{2})", text)
    filters["year"] = list(set(map(int, years)))

    for g in GENRES:
        if g.lower() in text:
            filters["genre"].append(g)

    for p in PLATFORMS:
        if p.lower() in text:
            filters["platform"].append(p)

    for pub in PUBLISHERS:
        if pub.lower() in text:
            filters["publisher"].append(pub)


    if "tên là" in text or "game tên" in text:
        filters["name"] = text
    else:
        filters["name"] = None


        return filters
@app.route("/api/nl-filter", methods=["POST"])
def nl_filter():
    body = request.get_json()
    query = body.get("query", "")

    filters = parse_query(query)
    filtered_df = apply_filters_with_body(df, filters)

    return jsonify({
        "query": query,
        "filters": filters,
        "total_games": int(filtered_df["Name"].nunique()),
        "total_sales": round(filtered_df["Global_Sales"].sum(), 2)
    })


@app.route("/api/report_csv", methods=["POST"])
def report_csv():
    body = request.get_json(force=True)
    filters = body.get("filters", {})

    filtered = apply_filters_with_body(df, filters)
    print("Filters nhận được:", filters)

    output = io.StringIO()
    filtered.to_csv(output, index=False)
    output.seek(0)

    return send_file(
        io.BytesIO(output.getvalue().encode("utf-8")),
        download_name="report.csv",
        as_attachment=True,
        mimetype="text/csv"
    )


@app.route("/api/options")
def get_options():
    return jsonify({
        "years": sorted(df["Year"].dropna().unique().astype(int).tolist()),
        "genres": sorted(df["Genre"].dropna().unique().tolist()),
        "platforms": sorted(df["Platform"].dropna().unique().tolist()),
        "publishers": sorted(df["Publisher"].dropna().unique().tolist()),
        "regions": ["NA", "EU", "JP", "Other"]
    })

def apply_filters(data):
    years = request.args.getlist("year")
    genres = request.args.getlist("genre")
    platforms = request.args.getlist("platform")
    publishers = request.args.getlist("publisher")
    regions = request.args.getlist("region")
    name = request.args.get("name")

    if years:
        data = data[data["Year"].isin(map(int, years))]
    if genres:
        data = data[data["Genre"].isin(genres)]
    if platforms:
        data = data[data["Platform"].isin(platforms)]
    if publishers:
        data = data[data["Publisher"].isin(publishers)]
    if regions:
        mask = False
        if "NA" in regions:
            mask |= data["NA_Sales"] > 0
        if "EU" in regions:
            mask |= data["EU_Sales"] > 0
        if "JP" in regions:
            mask |= data["JP_Sales"] > 0
        if "Other" in regions:
            mask |= data["Other_Sales"] > 0
        data = data[mask]
    if name:
        data = data[data["Name"].str.contains(name, case=False, na=False)]

    return data

def get_sales_columns():
    regions = request.args.getlist("region")
    mapping = {"NA": "NA_Sales", "EU": "EU_Sales", "JP": "JP_Sales", "Other": "Other_Sales"}
    if regions:
        return [mapping[r] for r in regions if r in mapping]
    return ["Global_Sales"]

@app.route("/api/top-games")
def top_games():
    data = apply_filters(df.copy())
    cols = get_sales_columns()

    if data.empty:
        return jsonify({"labels": [], "values": [], "metric": "No data"})

    data["Selected_Sales"] = data[cols].sum(axis=1)

    top = (
        data.groupby("Name")["Selected_Sales"]
        .sum()
        .sort_values(ascending=False)
        .head(10)
    )

    return jsonify({
        "labels": top.index.tolist(),
        "values": top.values.tolist(),
        "metric": "+".join(cols)
    })

@app.route("/api/region-sales")
def region_sales():
    q = apply_filters(df.copy())

    regions = request.args.getlist("region") 

    if regions:
        result = {}
        for r in regions:
            col = f"{r}_Sales" if r != "Global" else "Global_Sales"
            if col in q.columns:
                result[r] = q[col].sum()

        return jsonify({
            "labels": list(result.keys()),
            "values": list(result.values())
        })
    else:
        result = {
            "NA": q["NA_Sales"].sum(),
            "EU": q["EU_Sales"].sum(),
            "JP": q["JP_Sales"].sum(),
            "Other": q["Other_Sales"].sum(),
        }
        return jsonify({
            "labels": list(result.keys()),
            "values": list(result.values())
        })

@app.route("/api/kpi")
def kpi():
    data = apply_filters(df.copy())
    return jsonify({
        "total_sales": round(data["Global_Sales"].sum(), 2),
        "total_games": int(data["Name"].nunique())
    })

@app.route("/api/yearly-sales")
def yearly_sales():
    data = apply_filters(df.copy())
    cols = get_sales_columns()

    if data.empty or not cols:
        return jsonify({"labels": [], "datasets": []})

    data = data.dropna(subset=["Year"])
    data["Year"] = data["Year"].astype(int)

    years = sorted(data["Year"].unique().tolist())

    datasets = []
    for col in cols:
        yearly = data.groupby("Year")[col].sum()
        datasets.append({
            "label": col.replace("_Sales", ""), 
            "data": [yearly.get(y, 0) for y in years]
        })

    return jsonify({
        "labels": years,
        "datasets": datasets
    })

@app.route("/api/genre-sales")
def genre_sales():
    data = apply_filters(df.copy())

    if data.empty:
        return jsonify({})

    genre = (
        data.groupby("Genre")["Global_Sales"]
        .sum()
        .sort_values(ascending=False)
    )

    return jsonify(genre.to_dict())

@app.route("/api/publisher-sales")
def publisher_sales():
    q = apply_filters(df.copy())

    result = (
        q.groupby("Publisher")["Global_Sales"]
        .sum()
        .sort_values(ascending=False)
        .head(10)
    )

    return jsonify({
        "labels": result.index.tolist(),
        "values": result.values.tolist()
    })

if __name__ == "__main__":
    app.run(debug=True)