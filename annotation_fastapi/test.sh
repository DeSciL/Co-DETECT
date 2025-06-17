curl -X POST "http://127.0.0.1:8000/annotate/" \
  -H "accept: application/json" \
  -F "csv_file=@example/ghc_rnd.csv" \
  -F "guideline_file=@example/annotation_guideline.txt"
