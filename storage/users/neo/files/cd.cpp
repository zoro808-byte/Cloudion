#include <bits/stdc++.h>
using namespace std;

void solve() {
    int n, k;
    cin >> n >> k;

    if(k < n || k >= 2*n) {
        cout << -1 << '\n';
        return;
    }

    vector<vector<int>> res(n, vector<int>(n));
    int val = 1;
    for(int i = 0; i < n; i++) {
        for(int j = 0; j < n; j++) {
            res[i][j] = val++;
        }
    }

    int x = 1; 

    while(2*n-1 > k) {
        swap(res[0][x], res[x][x]);
        x++;
        k++;
    }

    for(int i = 0; i < n; i++) {
        for(int j = 0; j < n; j++) {
            cout << res[i][j] << " ";
        }

        cout << '\n';
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t = 1;
    cin >> t;

    while (t--) {
        solve();
    }

    return 0;
}