"""Write a judgments file from compact codes. Usage: judge.py work2 NN "1:TTTTT 2:AAAAA ..."
Codes: T talking head, A animation, G AI-generated visuals, S slides/diagram, R screen recording, O other."""
import json, sys
M = {"T": "Talking head", "A": "Animation", "G": "AI-generated visuals", "S": "Slides / diagram", "R": "Screen recording", "O": "Other"}
work, nn, spec = sys.argv[1], int(sys.argv[2]), sys.argv[3]
out = {}
for part in spec.split():
    row, codes = part.split(":")
    out[row] = [M[c] for c in codes]
json.dump(out, open(f"{work}/judgments/batch_{nn:02d}.json", "w"))
print(nn, len(out), "channels")
