const standardSteps = [
  'Clarify input, output, constraints, and edge cases.',
  'State a simple brute-force approach before optimizing.',
  'Identify the repeated work and choose the matching pattern.',
  'Dry run the optimized idea on a small example.',
  'State time and space complexity before coding.'
];

const commonMistakes = [
  'Skipping empty or single-element inputs.',
  'Not checking duplicate values or boundary indexes.',
  'Explaining code before explaining the invariant.',
  'Forgetting to state time and space complexity.'
];

const categoryGuides = {
  Arrays: {
    pattern: 'Index-based traversal with hashing, sorting, prefix sums, or in-place updates.',
    method: 'Start by asking whether fast lookup, ordered processing, a running aggregate, or in-place rearrangement removes repeated scans.',
    points: ['Check whether order must be preserved.', 'Consider duplicates and negative values.', 'Prefer O(n) lookup only when extra memory is acceptable.'],
    mistakes: ['Off-by-one loops and overwriting values before using them.', 'Sorting when original indexes must be returned.']
  },
  Strings: {
    pattern: 'Character traversal with frequency maps, parsing state, builders, or matching windows.',
    method: 'Define exactly what counts as a character match, normalization, or valid token; then track only the state needed while scanning.',
    points: ['Clarify case-sensitivity and spaces.', 'Avoid repeated string concatenation in loops.', 'Test empty and punctuation-heavy inputs.'],
    mistakes: ['Treating characters and tokens as interchangeable.', 'Forgetting leading/trailing spaces or invalid input formats.']
  },
  'Two Pointers': {
    pattern: 'Maintain two indexes whose movement discards impossible candidates.',
    method: 'Explain why moving the left or right pointer cannot lose the answer; that monotonic decision is the key invariant.',
    points: ['Sorting may be required first.', 'Define pointer movement on equality.', 'Watch duplicate skipping.'],
    mistakes: ['Moving both pointers without a proof.', 'Missing duplicate combinations after finding an answer.']
  },
  'Sliding Window': {
    pattern: 'Grow a contiguous window, then shrink it while the required condition remains valid.',
    method: 'Track the minimum information needed to know whether the window is valid, such as counts, sum, or distinct values.',
    points: ['State what makes a window valid.', 'Decide when to shrink.', 'Use a map/count array for character requirements.'],
    mistakes: ['Updating the result before the window is valid.', 'Removing a value without updating its frequency state.']
  },
  Matrix: {
    pattern: 'Grid traversal using row/column bounds, direction vectors, or layer processing.',
    method: 'Represent coordinates explicitly and check boundaries before moving or mutating cells.',
    points: ['Confirm rectangular dimensions.', 'Use visited state only if mutation is not safe.', 'List four-direction or eight-direction movement clearly.'],
    mistakes: ['Mixing row and column limits.', 'Revisiting cells or changing a cell too early.']
  },
  Hashing: {
    pattern: 'Store seen values, frequencies, or canonical signatures for constant-time lookup.',
    method: 'Choose the exact key that represents equivalence: raw value, count signature, prefix sum, or normalized form.',
    points: ['Explain the map key and value.', 'Handle duplicates intentionally.', 'Trade memory for faster lookup.'],
    mistakes: ['Checking after insertion when order matters.', 'Using an unstable key for grouping.']
  },
  Intervals: {
    pattern: 'Sort by start/end time, then merge or choose compatible ranges.',
    method: 'Once sorted, compare the current interval only with the last accepted interval or active boundary.',
    points: ['Clarify whether touching intervals overlap.', 'Sort once before scanning.', 'Maintain the merged end carefully.'],
    mistakes: ['Merging without sorting.', 'Dropping the final active interval.']
  },
  'Stacks & Queues': {
    pattern: 'Use LIFO for unresolved previous items or FIFO for level/order processing.',
    method: 'State what each stored item represents and when it can safely be removed.',
    points: ['Monotonic stacks remove weaker candidates.', 'Queues preserve processing order.', 'Store indexes when distances are needed.'],
    mistakes: ['Pushing values when indexes are required.', 'Popping without recording the resolved answer.']
  },
  'Linked Lists': {
    pattern: 'Pointer rewiring with dummy nodes, fast/slow pointers, or iterative reversal.',
    method: 'Draw the links before changing them and save the next node before mutation.',
    points: ['A dummy head simplifies edge cases.', 'Fast/slow pointers detect middle or cycles.', 'Return the correct new head.'],
    mistakes: ['Losing the remainder of the list.', 'Dereferencing null near the tail.']
  },
  Trees: {
    pattern: 'Recursive DFS for subtree results or BFS for level-by-level behavior.',
    method: 'Define what the recursive call returns for one subtree and combine left/right results at the parent.',
    points: ['State the base case.', 'Choose preorder/inorder/postorder intentionally.', 'Use BFS when depth order matters.'],
    mistakes: ['Using shared mutable state unnecessarily.', 'Forgetting null nodes or unbalanced trees.']
  },
  Graphs: {
    pattern: 'Represent edges with adjacency lists, then traverse using DFS/BFS or shortest-path logic.',
    method: 'Identify directed versus undirected, weighted versus unweighted, and whether revisiting requires a visited set or distance array.',
    points: ['Mark visited at the correct time.', 'Use BFS for unweighted shortest paths.', 'Detect cycles according to graph direction.'],
    mistakes: ['Building only one direction for undirected edges.', 'Marking visited too late and processing duplicates.']
  },
  'Dynamic Programming': {
    pattern: 'Cache overlapping subproblems using a state definition and recurrence.',
    method: 'Say what `dp[state]` means, list transitions, choose base cases, then optimize storage only after correctness.',
    points: ['The state meaning must be precise.', 'Show why transitions cover all choices.', 'Check impossible states.'],
    mistakes: ['Writing recurrence without defining state.', 'Incorrect initialization that makes unreachable states valid.']
  },
  'Recursion & Backtracking': {
    pattern: 'Explore a decision tree, commit one choice, recurse, and undo that choice.',
    method: 'Define the partial solution and pruning condition; then show how state is restored after each branch.',
    points: ['Separate choose/explore/unchoose.', 'Prune invalid branches early.', 'Copy results only at completed solutions.'],
    mistakes: ['Not undoing mutable state.', 'Adding the same combination in different orders.']
  },
  'Greedy Algorithms': {
    pattern: 'Make the locally best safe choice after sorting or prioritizing candidates.',
    method: 'The explanation must justify why the local choice never harms an optimal answer, often with an exchange argument.',
    points: ['Identify the choice criterion.', 'Sort in the required order.', 'Explain why reconsideration is unnecessary.'],
    mistakes: ['Calling an approach greedy without proving safety.', 'Choosing the wrong sort key.']
  },
  'Heap (Priority Queue)': {
    pattern: 'Keep quick access to the smallest/largest active candidate using a heap.',
    method: 'Use a heap when only the next best item matters, not full sorted order.',
    points: ['Choose min-heap versus max-heap.', 'Keep heap size bounded for top-k problems.', 'Store paired metadata where needed.'],
    mistakes: ['Sorting everything when data arrives dynamically.', 'Using the reversed heap direction.']
  },
  'Searching & Sorting': {
    pattern: 'Sort to create order, then binary search or scan using monotonic decisions.',
    method: 'Define the search range and the condition that lets one half be discarded.',
    points: ['Binary search needs a monotonic condition.', 'Be precise about inclusive bounds.', 'Know whether sorting changes required indexes.'],
    mistakes: ['Infinite loops from incorrect mid/bounds updates.', 'Binary searching a non-monotonic property.']
  },
  'Divide & Conquer': {
    pattern: 'Split into independent smaller portions, solve each, then combine results.',
    method: 'Explain both the division and why combining sub-results is cheaper than solving globally.',
    points: ['Identify the base case.', 'Account for combine cost.', 'Consider recursion stack space.'],
    mistakes: ['Ignoring combine logic.', 'Creating overlapping work that should be memoized instead.']
  },
  'Bit Manipulation': {
    pattern: 'Use bits as compact flags and exploit XOR, masks, shifts, or bit counts.',
    method: 'Translate the operation to binary meaning before writing expressions.',
    points: ['Explain each mask.', 'Consider signed integer behavior.', 'XOR cancels equal values.'],
    mistakes: ['Confusing bit index with bit value.', 'Operator precedence errors in masks.']
  },
  'Math & Geometry': {
    pattern: 'Convert the problem into invariants, coordinate relationships, number theory, or simulation.',
    method: 'Derive the formula or invariant first, then handle precision and overflow deliberately.',
    points: ['Check integer overflow.', 'Clarify rounding and modulo requirements.', 'Use cross-products for orientation when appropriate.'],
    mistakes: ['Using floating point when exact integer comparison is possible.', 'Missing zero or negative cases.']
  },
  Trie: {
    pattern: 'Store words character-by-character in a prefix tree for prefix operations.',
    method: 'Each traversal follows characters; distinguish a completed word from a prefix path.',
    points: ['Use end-of-word markers.', 'A trie trades memory for prefix speed.', 'Combine with DFS for wildcard/search board tasks.'],
    mistakes: ['Treating every prefix as a complete word.', 'Forgetting to terminate or prune searches.']
  },
  'Disjoint Sets': {
    pattern: 'Maintain connected components using union-find with path compression and rank/size.',
    method: 'Initialize each node as its own parent, union edges, and use roots to test connectivity or cycles.',
    points: ['Path compression improves repeated finds.', 'Union by rank/size limits tree height.', 'Count components only when roots merge.'],
    mistakes: ['Decreasing component count on redundant union.', 'Comparing direct parents instead of roots.']
  },
  'Segment Tree': {
    pattern: 'Store interval aggregates in a tree to support range queries and updates efficiently.',
    method: 'Define the aggregate (sum/min/max), build from ranges, then recurse only into overlapping segments.',
    points: ['State query/update complexity.', 'Handle no-overlap and full-overlap cases.', 'Coordinate zero/one-based indexes.'],
    mistakes: ['Incorrect segment boundaries.', 'Failing to update parent aggregates after a point update.']
  },
  "Kadane's Algorithms": {
    pattern: 'Track the best subarray ending at the current position and the best seen globally.',
    method: 'At each value, decide whether to extend the previous subarray or start new from the current value.',
    points: ['Handle all-negative arrays.', 'Track indexes if the subarray itself is required.', 'The running state represents an ending-here answer.'],
    mistakes: ['Resetting to zero when negative-only results are valid.', 'Confusing current best with global best.']
  }
};

const namedGuides = [
  {
    match: /two sum/i,
    pattern: 'Complement lookup with a hash map.',
    method: 'For each value `x`, check whether `target - x` was seen earlier; if found, return the two indexes. Otherwise store `x` with its index.',
    points: ['Check before storing to avoid pairing an element with itself.', 'This preserves original indexes without sorting.', 'Expected complexity: O(n) time and O(n) space.'],
    mistakes: ['Returning values instead of indexes.', 'Using the same index twice when target is twice one value.']
  },
  {
    match: /3sum|4sum/i,
    pattern: 'Sorting plus fixed values and inward-moving two pointers.',
    method: 'Sort first, fix one or more positions, then search remaining combinations by moving pointers according to the current sum.',
    points: ['Skip duplicates at every fixed/pointer level.', 'Sorted order makes pointer decisions valid.', 'Complexity is dominated by nested scans.'],
    mistakes: ['Adding duplicate answer sets.', 'Moving pointers incorrectly after a match.']
  },
  {
    match: /trapping rain water/i,
    pattern: 'Two pointers with left-max and right-max boundaries.',
    method: 'Move the side with the smaller current boundary; that side already knows its maximum possible water level.',
    points: ['Water above a bar is limited by the lower boundary.', 'No extra prefix arrays are required in the optimized version.', 'Complexity: O(n) time, O(1) space.'],
    mistakes: ['Using the higher boundary to calculate water.', 'Adding negative trapped water.']
  },
  {
    match: /longest substring without repeating/i,
    pattern: 'Sliding window with last-seen index or character set.',
    method: 'Expand right; when a character repeats inside the active window, move left past its previous occurrence.',
    points: ['Never move the left boundary backwards.', 'Record the maximum valid window length.', 'Complexity: O(n).'],
    mistakes: ['Restarting the window instead of jumping left.', 'Treating a repeat outside the current window as invalid.']
  },
  {
    match: /minimum window substring/i,
    pattern: 'Variable sliding window with required-frequency accounting.',
    method: 'Expand until all required character counts are met, then shrink while still valid to minimize length.',
    points: ['Track required versus satisfied counts.', 'Only update the answer for valid windows.', 'Complexity: O(n + alphabet).'],
    mistakes: ['Counting distinct matches instead of required multiplicities.', 'Shrinking without decrementing validity correctly.']
  },
  {
    match: /subarray sum equals k/i,
    pattern: 'Prefix sum frequency map.',
    method: 'If current prefix is `sum`, every earlier prefix of `sum - k` produces a valid subarray ending here.',
    points: ['Initialize frequency of prefix sum zero to one.', 'Works with negative values unlike a simple sliding window.', 'Complexity: O(n).'],
    mistakes: ['Using two pointers when negatives exist.', 'Forgetting subarrays that begin at index zero.']
  },
  {
    match: /merge intervals/i,
    pattern: 'Sort intervals by start, then merge overlapping ranges.',
    method: 'Keep a current merged interval; extend its end on overlap or commit it when the next interval starts later.',
    points: ['Sorting creates a single forward scan.', 'Clarify whether touching endpoints overlap.', 'Complexity: O(n log n).'],
    mistakes: ['Scanning unsorted intervals.', 'Forgetting to append the final interval.']
  },
  {
    match: /reverse linked list/i,
    pattern: 'Iterative pointer reversal.',
    method: 'Maintain `prev`, `curr`, and saved `next`; redirect `curr.next`, then advance all pointers.',
    points: ['Save next before changing the link.', 'The final `prev` is the new head.', 'Complexity: O(n) time, O(1) space.'],
    mistakes: ['Losing the remaining list.', 'Returning the old head.']
  }
];

export function getLearningGuide(problem) {
  const category = problem.topic || problem.category || 'Arrays';
  const name = problem.title || problem.problem || problem.name || '';
  const categoryGuide = categoryGuides[category] || categoryGuides.Arrays;
  const namedGuide = namedGuides.find((guide) => guide.match.test(name));
  return {
    pattern: namedGuide?.pattern || categoryGuide.pattern,
    method: namedGuide?.method || categoryGuide.method,
    points: namedGuide?.points || categoryGuide.points,
    mistakes: namedGuide?.mistakes || categoryGuide.mistakes || commonMistakes,
    interviewSteps: standardSteps
  };
}
