import pandas as pd

# Read the CSV files
df1 = pd.read_csv('annotation_result_sample_ghc_rnd.csv')
df2 = pd.read_csv('annotation_result_sample_ghc_rnd_reannotate.csv')

# Check if UIDs match
print("Number of rows in first file:", len(df1))
print("Number of rows in second file:", len(df2))
print("\nUIDs match:", len(df1) == len(df2) and all(df1['uid'] == df2['uid']))

# Compare new_edge_case and confidence columns
merged_df = pd.merge(df1, df2, on='uid', suffixes=('_original', '_reannotated'))

# Count differences in new_edge_case
edge_case_changes = merged_df[merged_df['new_edge_case_original'] != merged_df['new_edge_case_reannotated']]
true_to_false = len(edge_case_changes[(edge_case_changes['new_edge_case_original'] == True) & 
                                    (edge_case_changes['new_edge_case_reannotated'] == False)])
false_to_true = len(edge_case_changes[(edge_case_changes['new_edge_case_original'] == False) & 
                                    (edge_case_changes['new_edge_case_reannotated'] == True)])

print("Changes from True to False:", true_to_false)
print("Previous edge cases:", len(merged_df[merged_df['new_edge_case_original'] == True]))
print("Current edge cases:", len(merged_df[merged_df['new_edge_case_reannotated'] == True]))

# Compare confidence values
confidence_diff = merged_df['confidence_reannotated'] - merged_df['confidence_original']
print("Average confidence increase:", confidence_diff.mean())

# Previous edge cases
old_edge_cases = merged_df[merged_df['new_edge_case_original'] == True]
old_non_edge_cases = merged_df[merged_df['new_edge_case_original'] == False]

# Confidence change of old edge cases
edge_confidence_diff = old_edge_cases['confidence_reannotated'] - old_edge_cases['confidence_original']
print("Average confidence increase for old edge cases:", edge_confidence_diff.mean())

# Confidence change of old non-edge cases
non_edge_confidence_diff = old_non_edge_cases['confidence_reannotated'] - old_non_edge_cases['confidence_original']
print("Average confidence increase for old non-edge cases:", non_edge_confidence_diff.mean())